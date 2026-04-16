import express from "express";
import cors from "cors";
import { config } from "./lib/config";
import { callAgent } from "./lib/anthropic";
import { registerAgent, giveFeedback } from "./lib/erc8004";
import { x402Middleware } from "./lib/x402";
import { demoActivitySeeds, demoAgentSeeds, demoMetricsById } from "./lib/demoData";
import { SWARM_MCP_TOOLS, SWARM_MCP_VERSION } from "./mcpTools";
import { loadSnapshot, saveSnapshot } from "./lib/persist";

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// In-memory store (replace with DB for production)
// ============================================================

type PricingModel = "flat" | "tiered" | "per_token" | "per_minute";

interface AgentListing {
  id: string;
  name: string;
  skill: string;
  description: string;
  price: string;
  address: string;        // wallet that receives payment
  creatorAddress: string;  // who created this agent (same for pre-built, different for custom)
  systemPrompt: string;
  agentId?: bigint;        // ERC-8004 identity NFT id
  reputation: { count: number; averageScore: number };
  totalCalls: number;
  type: "ai" | "custom_skill" | "human_expert";
  pricingModel?: PricingModel;
  pricingNote?: string;
  userCreated?: boolean;   // true = submitted via API; persisted to disk
}

// Reasonable defaults per skill type — agents that scale with input get tiered
// or per-token; agents that are flat lookups stay flat. Values are surfaced
// on the agent detail page so callers know what they're paying for.
function pricingDefaultsFor(skill: string, type: AgentListing["type"]): { pricingModel: PricingModel; pricingNote: string } {
  const s = skill.toLowerCase();
  if (type === "human_expert") {
    return { pricingModel: "flat", pricingNote: "Flat per-task bounty. Extended scope = new task." };
  }
  if (s.includes("forensics") || s.includes("mev")) {
    return { pricingModel: "tiered", pricingNote: "Base price covers up to 10 hops / 50 blocks; +20% per additional tier." };
  }
  if (s.includes("exploit") || s.includes("audit") || s.includes("circuit") || s.includes("verification")) {
    return { pricingModel: "tiered", pricingNote: "Base price covers up to 200 LOC; long contracts quoted in scope tiers." };
  }
  if (s.includes("summar") || s.includes("research") || s.includes("governance") || s.includes("compliance") || s.includes("regulatory")) {
    return { pricingModel: "per_token", pricingNote: "Per 1k input tokens; output capped at 2k tokens per call." };
  }
  if (s.includes("incident") || s.includes("runtime") || s.includes("triage")) {
    return { pricingModel: "per_minute", pricingNote: "Streamed per minute of monitoring or response session." };
  }
  return { pricingModel: "flat", pricingNote: "Flat rate per call — no overage." };
}

interface TaskPosting {
  id: string;
  description: string;
  bounty: string;
  skill: string;
  status: "open" | "claimed" | "completed";
  postedBy: string;       // agent that posted it
  claimedBy?: string;     // human expert address
  result?: string;
  createdAt: number;
}

interface HumanExpertApplication {
  name: string;
  skill: string;
  description: string;
  rate: string;
  walletAddress: string;
}

const agents: Map<string, AgentListing> = new Map();
const tasks: Map<string, TaskPosting> = new Map();
const activityLog: Array<{
  type: "payment" | "reputation" | "task" | "registration";
  message: string;
  timestamp: number;
}> = [...demoActivitySeeds].sort((a, b) => b.timestamp - a.timestamp);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function logActivity(type: "payment" | "reputation" | "task" | "registration", message: string) {
  // Dedupe: if the exact message is already at the top of the log, don't stack it.
  const head = activityLog[0];
  if (head && head.type === type && head.message === message) return;
  activityLog.unshift({ type, message, timestamp: Date.now() });
  if (activityLog.length > 100) activityLog.pop();
}

// ============================================================
// Initialize pre-built agents
// ============================================================

function initAgents() {
  const agentConfigs = config.agents;

  for (const [key, agentConfig] of Object.entries(agentConfigs)) {
    const metrics = demoMetricsById[key] || {
      reputation: { count: 0, averageScore: 0 },
      totalCalls: 0,
    };

    agents.set(key, {
      id: key,
      name: agentConfig.name,
      skill: agentConfig.skill,
      description: agentConfig.description,
      price: agentConfig.price,
      address: agentConfig.address,
      creatorAddress: agentConfig.address,
      systemPrompt: agentConfig.systemPrompt,
      reputation: metrics.reputation,
      totalCalls: metrics.totalCalls,
      type: key === "solidityAuditor" ? "custom_skill" : "ai",
    });
  }

  // Add human expert listing
  const humanMetrics = demoMetricsById.humanExpert || {
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
  };

  agents.set("humanExpert", {
    id: "humanExpert",
    name: "Human Expert",
    skill: "Code Architecture",
    description: "Senior engineer available for architectural decisions and complex problem-solving",
    price: "$0.50/task",
    address: config.humanExpert.address,
    creatorAddress: config.humanExpert.address,
    systemPrompt: "",
    reputation: humanMetrics.reputation,
    totalCalls: humanMetrics.totalCalls,
    type: "human_expert",
  });

  for (const demoAgent of demoAgentSeeds) {
    agents.set(demoAgent.id, { ...demoAgent });
  }
}

initAgents();

// ============================================================
// Hydrate user-submitted state from the JSON snapshot (if any)
// ============================================================
function snapshotNow() {
  const userAgents = Array.from(agents.values()).filter((a) => a.userCreated);
  return {
    userAgents: userAgents.map((a) => ({ ...a, agentId: a.agentId?.toString() })),
    userExperts: [], // experts are stored as AgentListing with userCreated=true
    tasks: Array.from(tasks.values()),
    updatedAt: Date.now(),
  };
}

function persist() {
  saveSnapshot(snapshotNow());
}

function hydrateFromSnapshot() {
  const snap = loadSnapshot();
  let hydratedAgents = 0;
  for (const raw of snap.userAgents as AgentListing[]) {
    if (!raw?.id || agents.has(raw.id)) continue;
    agents.set(raw.id, { ...raw, userCreated: true });
    hydratedAgents += 1;
  }
  let hydratedTasks = 0;
  for (const raw of snap.tasks as TaskPosting[]) {
    if (!raw?.id || tasks.has(raw.id)) continue;
    tasks.set(raw.id, raw);
    hydratedTasks += 1;
  }
  if (hydratedAgents || hydratedTasks) {
    console.log(`[persist] hydrated ${hydratedAgents} user agents and ${hydratedTasks} tasks from disk`);
  }
}

hydrateFromSnapshot();

// ============================================================
// x402 Payment Middleware
// ============================================================
// Build a route config for each agent's /call endpoint, priced per agent
function buildX402Routes() {
  const routes: Record<string, { price: string; payTo: string; description?: string }> = {};
  for (const [key, agent] of agents.entries()) {
    if (agent.type === "human_expert") continue;
    routes[`POST /api/agents/${key}/call`] = {
      price: agent.price,
      payTo: agent.address,
      description: `${agent.name} — ${agent.skill}`,
    };
  }
  return routes;
}

app.use(x402Middleware(buildX402Routes()));

// ============================================================
// API Routes
// ============================================================

function serializeAgent(a: AgentListing) {
  const defaults = pricingDefaultsFor(a.skill, a.type);
  return {
    id: a.id,
    name: a.name,
    skill: a.skill,
    description: a.description,
    price: a.price,
    address: a.address,
    type: a.type,
    reputation: a.reputation,
    totalCalls: a.totalCalls,
    agentId: a.agentId?.toString(),
    pricingModel: a.pricingModel ?? defaults.pricingModel,
    pricingNote: a.pricingNote ?? defaults.pricingNote,
  };
}

// List all agents
app.get("/api/agents", (_req, res) => {
  const list = Array.from(agents.values())
    .sort((left, right) => {
      if (right.reputation.averageScore !== left.reputation.averageScore) {
        return right.reputation.averageScore - left.reputation.averageScore;
      }
      return right.totalCalls - left.totalCalls;
    })
    .map(serializeAgent);
  res.json(list);
});

// Get single agent
app.get("/api/agents/:id", (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  res.json(serializeAgent(agent));
});

// Get a dynamic quote for a specific request, before committing to pay.
// The agent inspects the scope of the task and returns how much the total
// will actually cost (base price + overage, or just base if the scope fits).
// This is how x402 is meant to work — the 402 response carries the quote.
app.post("/api/agents/:id/quote", async (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  if (agent.type === "human_expert") return res.status(400).json({ error: "Human experts quote via task board, not direct quote" });

  const { input } = req.body;
  if (!input) return res.status(400).json({ error: "Missing 'input' field" });

  const defaults = pricingDefaultsFor(agent.skill, agent.type);
  const pricingModel = agent.pricingModel ?? defaults.pricingModel;
  const pricingNote = agent.pricingNote ?? defaults.pricingNote;
  const basePrice = agent.price;

  // Flat-priced agents just return the base price with no analysis — save a round trip.
  if (pricingModel === "flat") {
    return res.json({
      basePrice,
      totalPrice: basePrice,
      overage: "$0.00",
      tier: "base",
      scope: "Flat per-call rate. No scope analysis needed.",
      rationale: "This agent charges a flat per-call price regardless of input size.",
      pricingModel,
      pricingNote,
    });
  }

  // Ask the model to analyze scope and return a structured quote. System
  // prompt is intentionally narrow — we want a JSON quote, not an answer.
  const quoteSystem = `You are ${agent.name}, a ${agent.skill} specialist. You bill on a "${pricingModel}" model. Base price: ${basePrice}. Pricing note: ${pricingNote}.

A caller is asking you to do a task. Before you do any work, analyze the SCOPE of the request and return a JSON quote. Think about the concrete quantities involved: number of hops to trace, lines of code to review, tokens of content, minutes of monitoring, etc.

Respond with ONLY a JSON object (no other text):
{
  "tier": "base" | "standard" | "deep",
  "scope": "one short sentence describing what you actually counted (e.g., '~27 hops through 3 mixers' or '412 LOC across 2 contracts')",
  "overage": "$0.XX — dollar amount above base price, or $0.00 if base covers it",
  "totalPrice": "$0.XX — the total the caller will be charged",
  "rationale": "one short sentence explaining why the price is what it is"
}

Be honest and conservative. Most short requests fit in the base tier. Only charge overage if the scope truly exceeds what base covers.`;

  try {
    const raw = await callAgent(quoteSystem, input);
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;

    if (!parsed || typeof parsed !== "object") {
      throw new Error("agent returned no parseable quote");
    }

    res.json({
      basePrice,
      totalPrice: parsed.totalPrice ?? basePrice,
      overage: parsed.overage ?? "$0.00",
      tier: parsed.tier ?? "base",
      scope: parsed.scope ?? "scope unclear",
      rationale: parsed.rationale ?? "",
      pricingModel,
      pricingNote,
    });
  } catch (err: unknown) {
    // If the AI is unavailable, fall back to the base price with a disclosed note.
    res.json({
      basePrice,
      totalPrice: basePrice,
      overage: "$0.00",
      tier: "base",
      scope: "scope analysis unavailable — using base rate",
      rationale: `Quote unavailable (${getErrorMessage(err)}). You'll be charged the base rate.`,
      pricingModel,
      pricingNote,
    });
  }
});

// Call an AI agent (this is the x402-paywalled endpoint in production)
// Accepts an optional quotedPrice from a prior /quote call — the caller has
// already seen and approved the total, so we charge exactly that.
app.post("/api/agents/:id/call", async (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  if (agent.type === "human_expert") return res.status(400).json({ error: "Cannot call human expert directly — post a task instead" });

  const { input, quotedPrice } = req.body;
  if (!input) return res.status(400).json({ error: "Missing 'input' field" });

  // Use quotedPrice if the caller went through the quote flow, else flat price.
  const chargedPrice: string = typeof quotedPrice === "string" && quotedPrice.startsWith("$")
    ? quotedPrice
    : agent.price;

  try {
    const result = await callAgent(agent.systemPrompt, input);
    agent.totalCalls++;

    logActivity("payment", `${agent.name} called — ${chargedPrice} USDC paid to ${agent.address.slice(0, 8)}...`);

    res.json({
      agent: agent.name,
      result,
      price: chargedPrice,
      basePrice: agent.price,
      paidTo: agent.address,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// Rate an agent (writes to ERC-8004 Reputation Registry)
app.post("/api/agents/:id/rate", async (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  const { score } = req.body; // 1-5
  if (!score || score < 1 || score > 5) return res.status(400).json({ error: "Score must be 1-5" });

  if (agent.agentId !== undefined) {
    try {
      await giveFeedback(
        config.orchestrator.privateKey,
        agent.agentId,
        score,
        agent.skill.toLowerCase().replace(/\s+/g, "_"),
        `/api/agents/${agent.id}/call`
      );
      logActivity("reputation", `${agent.name} rated ${score}/5 — on-chain reputation updated`);
    } catch (err: unknown) {
      console.error("ERC-8004 feedback failed:", getErrorMessage(err));
      // Continue even if on-chain fails — update local state
    }
  }

  // Update local reputation (running average)
  const rep = agent.reputation;
  const newCount = rep.count + 1;
  const newAvg = (rep.averageScore * rep.count + score) / newCount;
  agent.reputation = { count: newCount, averageScore: Math.round(newAvg * 10) / 10 };

  res.json({ success: true, reputation: agent.reputation });
});

// Register agents on ERC-8004 (call once to set up identities)
app.post("/api/register-agents", async (_req, res) => {
  const results: Record<string, string> = {};

  for (const [key, agent] of agents.entries()) {
    if (agent.agentId !== undefined) {
      results[key] = `Already registered (agentId: ${agent.agentId})`;
      continue;
    }

    try {
      const agentURI = JSON.stringify({
        name: agent.name,
        skill: agent.skill,
        description: agent.description,
        price: agent.price,
        type: agent.type,
      });

      const agentId = await registerAgent(config.orchestrator.privateKey, agentURI);
      agent.agentId = agentId;
      results[key] = `Registered with agentId: ${agentId}`;
      logActivity("registration", `${agent.name} registered on ERC-8004 — agentId: ${agentId}`);
    } catch (err: unknown) {
      results[key] = `Failed: ${getErrorMessage(err)}`;
    }
  }

  res.json(results);
});

// ============================================================
// Task Board (Agent → Human escalation)
// ============================================================

// Post a task (agent posts a bounty for human help)
app.post("/api/tasks", (req, res) => {
  const { description, bounty, skill, postedBy } = req.body;
  if (!description || !bounty || !skill) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const id = `task_${Date.now()}`;
  const task: TaskPosting = {
    id,
    description,
    bounty,
    skill,
    status: "open",
    postedBy: postedBy || "orchestrator",
    createdAt: Date.now(),
  };
  tasks.set(id, task);
  logActivity("task", `New task posted: "${description.slice(0, 50)}..." — ${bounty} USDC bounty`);
  persist();

  res.json(task);
});

// List tasks
app.get("/api/tasks", (_req, res) => {
  res.json(Array.from(tasks.values()));
});

// Claim a task (human expert claims it)
app.post("/api/tasks/:id/claim", (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (task.status !== "open") return res.status(400).json({ error: "Task is not open" });

  task.status = "claimed";
  task.claimedBy = req.body.expertAddress || config.humanExpert.address;
  logActivity("task", `Task claimed by expert ${task.claimedBy?.slice(0, 8)}...`);
  persist();

  res.json(task);
});

// Submit task result (human expert submits work)
app.post("/api/tasks/:id/submit", (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (task.status !== "claimed") return res.status(400).json({ error: "Task is not claimed" });

  task.status = "completed";
  task.result = req.body.result;
  logActivity("payment", `Task completed — ${task.bounty} USDC paid to expert ${task.claimedBy?.slice(0, 8)}...`);
  persist();

  res.json(task);
});

// ============================================================
// List a custom skill agent
// ============================================================

app.post("/api/agents/create", (req, res) => {
  const { name, skill, description, price, systemPrompt, creatorAddress } = req.body;
  if (!name || !skill || !description || !price || !systemPrompt || !creatorAddress) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const id = `custom_${Date.now()}`;
  const agent: AgentListing = {
    id,
    name,
    skill,
    description,
    price,
    address: creatorAddress, // creator receives payments
    creatorAddress,
    systemPrompt,
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "custom_skill",
    userCreated: true,
  };
  agents.set(id, agent);
  logActivity("registration", `New custom agent "${name}" listed by ${creatorAddress.slice(0, 8)}...`);
  persist();

  res.json(serializeAgent(agent));
});

// ============================================================
// Apply as a human expert
// ============================================================

app.post("/api/experts/apply", (req, res) => {
  const {
    name,
    skill,
    description,
    rate,
    walletAddress,
  } = req.body as HumanExpertApplication;

  if (!name || !skill || !description || !rate || !walletAddress) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const normalizedAddress = walletAddress.toLowerCase();
  const existingExpert = Array.from(agents.values()).find(
    (agent) =>
      agent.type === "human_expert" &&
      agent.address.toLowerCase() === normalizedAddress
  );

  if (existingExpert) {
    return res.status(409).json({
      error: "An expert profile already exists for this wallet address",
      agent: existingExpert,
    });
  }

  const id = `expert_${Date.now()}`;
  const expert: AgentListing = {
    id,
    name,
    skill,
    description,
    price: `$${rate}/task`,
    address: walletAddress,
    creatorAddress: walletAddress,
    systemPrompt: "",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "human_expert",
    userCreated: true,
  };

  agents.set(id, expert);
  logActivity(
    "registration",
    `New human expert "${name}" applied with wallet ${walletAddress.slice(0, 8)}...`
  );
  persist();

  res.status(201).json(serializeAgent(expert));
});

// ============================================================
// Activity feed
// ============================================================

app.get("/api/activity", (_req, res) => {
  res.json(activityLog);
});

// ============================================================
// MCP status (live surface for Connect page + status bar)
// ============================================================

app.get("/api/mcp/status", (_req, res) => {
  res.json({
    status: "ready",
    version: SWARM_MCP_VERSION,
    tools: SWARM_MCP_TOOLS.map((t) => t.name),
    toolDefs: SWARM_MCP_TOOLS,
    transports: ["stdio"],
    apiBase: `http://localhost:${config.port}`,
  });
});

app.post("/api/mcp/ping", (_req, res) => {
  const start = Date.now();
  // Trivial "ping": list agents through the same code path the MCP tool uses.
  const list = Array.from(agents.values()).map((a) => ({
    id: a.id,
    name: a.name,
    skill: a.skill,
    type: a.type,
  }));
  const latencyMs = Date.now() - start;
  res.json({ ok: true, latencyMs, agentCount: list.length, tool: "swarm_list_agents" });
});

// ============================================================
// Orchestrator endpoint — complex task that hires other agents
// ============================================================

app.post("/api/orchestrate", async (req, res) => {
  const { task } = req.body;
  if (!task) return res.status(400).json({ error: "Missing 'task' field" });

  logActivity("task", `Conductor received: "${task.slice(0, 60)}..."`);

  // Step 1: Break down the task
  const breakdown = await callAgent(
    `You are a task orchestrator for Swarm, a marketplace of specialized crypto/blockchain agents. Break a complex task into subtasks that each map to ONE of these specialists:

- Chainsight (on-chain forensics, fund tracing, wallet clustering) - $0.14/call [agent key: linguaBot]
- Solmantis (Solidity exploit detection, reentrancy, proxy storage collisions) - $0.18/call [agent key: codeReviewer]
- MEV Scope (sandwich attacks, JIT liquidity, private-mempool flow) - $0.09/call [agent key: summarizer]
- RegulaNet (MiCA, SEC, FATF regulatory analysis) - $0.22/call [agent key: solidityAuditor]

If a subtask needs real human judgment (edge-case legal wording, tokenomics intuition, final architectural sign-off), mark it as "HUMAN_NEEDED".

Respond as JSON array only: [{"agent": "linguaBot"|"codeReviewer"|"summarizer"|"solidityAuditor"|"HUMAN_NEEDED", "subtask": "short description", "input": "the actual input to send"}]`,
    task
  );

  let subtasks: Array<{ agent: string; subtask: string; input: string }>;
  try {
    const jsonMatch = breakdown.match(/\[[\s\S]*\]/);
    subtasks = JSON.parse(jsonMatch?.[0] || "[]");
  } catch {
    subtasks = [{ agent: "summarizer", subtask: "Process the request", input: task }];
  }

  const results: Array<{
    agent: string;
    subtask: string;
    result: string;
    price: string;
    type: "agent" | "human";
  }> = [];

  // Step 2: Execute subtasks
  for (const sub of subtasks) {
    if (sub.agent === "HUMAN_NEEDED") {
      // Post a task for human experts
      const taskId = `task_${Date.now()}`;
      const taskPosting: TaskPosting = {
        id: taskId,
        description: sub.subtask,
        bounty: "$0.50",
        skill: "Expert Judgment",
        status: "open",
        postedBy: "orchestrator",
        createdAt: Date.now(),
      };
      tasks.set(taskId, taskPosting);
      logActivity("task", `Conductor escalated to human: "${sub.subtask.slice(0, 50)}..."`);

      results.push({
        agent: "Human Expert",
        subtask: sub.subtask,
        result: `Task posted for human expert (${taskId}). Awaiting claim.`,
        price: "$0.50",
        type: "human",
      });
    } else {
      const agent = agents.get(sub.agent);
      if (!agent) continue;

      logActivity("payment", `Conductor hiring ${agent.name} — ${agent.price} USDC`);

      const result = await callAgent(agent.systemPrompt, sub.input);
      agent.totalCalls++;

      // Update reputation (simulated positive feedback for successful calls)
      const rep = agent.reputation;
      const newCount = rep.count + 1;
      const score = 4 + Math.random(); // 4.0-5.0 for successful auto-calls
      const newAvg = (rep.averageScore * rep.count + score) / newCount;
      agent.reputation = { count: newCount, averageScore: Math.round(newAvg * 10) / 10 };

      logActivity("reputation", `${agent.name} reputation updated: ${agent.reputation.averageScore}/5 (${agent.reputation.count} reviews)`);

      results.push({
        agent: agent.name,
        subtask: sub.subtask,
        result,
        price: agent.price,
        type: "agent",
      });
    }
  }

  res.json({
    originalTask: task,
    subtasks: results,
    totalCost: results.reduce((sum, r) => {
      const price = parseFloat(r.price.replace("$", ""));
      return sum + price;
    }, 0).toFixed(2),
  });
});

// ============================================================
// Start server
// ============================================================

app.listen(config.port, () => {
  console.log(`\n🐝 Swarm API running on http://localhost:${config.port}`);
  console.log(`   Agents loaded: ${agents.size}`);
  console.log(`   Facilitator: ${config.facilitatorUrl}`);
  console.log(`   Chain: Avalanche Fuji (${config.chainId})\n`);
});
