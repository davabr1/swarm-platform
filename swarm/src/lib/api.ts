export type PricingModel = "flat" | "tiered" | "per_token" | "per_minute";

export interface Agent {
  id: string;
  name: string;
  skill: string;
  description: string;
  price: string;
  address: string;
  creatorAddress?: string;
  type: "ai" | "custom_skill" | "human_expert";
  reputation: { count: number; averageScore: number };
  totalCalls: number;
  agentId?: string;
  pricingModel?: PricingModel;
  pricingNote?: string;
}

export interface Task {
  id: string;
  description: string;
  bounty: string;
  skill: string;
  status: "open" | "claimed" | "completed";
  postedBy: string;
  claimedBy?: string;
  result?: string;
  createdAt: number;
}

export interface ActivityItem {
  type: "payment" | "reputation" | "task" | "registration";
  message: string;
  timestamp: number;
}

export interface OrchestrateResult {
  originalTask: string;
  subtasks: Array<{
    agent: string;
    subtask: string;
    result: string;
    price: string;
    type: "agent" | "human";
  }>;
  totalCost: string;
}

export async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch(`/api/agents`);
  return res.json();
}

export async function fetchAgent(id: string): Promise<Agent> {
  const res = await fetch(`/api/agents/${id}`);
  return res.json();
}

export async function callAgent(
  id: string,
  input: string,
  quotedPrice?: string
): Promise<{ agent: string; result: string; price: string; basePrice?: string; paidTo: string }> {
  const res = await fetch(`/api/agents/${id}/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, quotedPrice }),
  });
  return res.json();
}

export interface AgentQuote {
  basePrice: string;
  totalPrice: string;
  overage: string;
  tier: "base" | "standard" | "deep" | string;
  scope: string;
  rationale: string;
  pricingModel: string;
  pricingNote: string;
}

export async function quoteAgent(id: string, input: string): Promise<AgentQuote> {
  const res = await fetch(`/api/agents/${id}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || "quote failed");
  }
  return res.json();
}

export async function rateAgent(id: string, score: number): Promise<{ success: boolean; reputation: { count: number; averageScore: number } }> {
  const res = await fetch(`/api/agents/${id}/rate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score }),
  });
  return res.json();
}

export async function orchestrate(task: string): Promise<OrchestrateResult> {
  const res = await fetch(`/api/orchestrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task }),
  });
  return res.json();
}

export async function fetchTasks(): Promise<Task[]> {
  const res = await fetch(`/api/tasks`);
  return res.json();
}

export async function claimTask(id: string, expertAddress?: string): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expertAddress }),
  });
  return res.json();
}

export async function submitTask(id: string, result: string): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ result }),
  });
  return res.json();
}

export async function createCustomAgent(data: {
  name: string;
  skill: string;
  description: string;
  price: string;
  systemPrompt: string;
  creatorAddress: string;
  useSwarmWrapper?: boolean;
}): Promise<Agent> {
  const res = await fetch(`/api/agents/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function applyAsExpert(data: {
  name: string;
  skill: string;
  description: string;
  rate: string;
  walletAddress: string;
}): Promise<Agent> {
  const res = await fetch(`/api/experts/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || "Failed to apply as expert");
  }

  return res.json();
}

export async function fetchActivity(): Promise<ActivityItem[]> {
  const res = await fetch(`/api/activity`);
  return res.json();
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpStatus {
  status: "ready" | "down";
  version: string;
  tools: string[];
  toolDefs: McpToolDef[];
  transports: string[];
  apiBase: string;
}

export async function getMcpStatus(): Promise<McpStatus> {
  const res = await fetch(`/api/mcp/status`, { cache: "no-store" });
  if (!res.ok) throw new Error("mcp down");
  return res.json();
}

export async function pingMcp(): Promise<{ ok: boolean; latencyMs: number; agentCount: number }> {
  const res = await fetch(`/api/mcp/ping`, { method: "POST" });
  if (!res.ok) throw new Error("ping failed");
  return res.json();
}
