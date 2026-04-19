#!/usr/bin/env node
/**
 * Swarm MCP Server
 *
 * Exposes the Swarm marketplace as MCP tools so any AI agent
 * (Claude Code, Cursor, Codex, etc.) can discover and ask specialist
 * agents for guidance with a single config line.
 *
 * Config in .mcp.json / claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "swarm": {
 *         "command": "npx",
 *         "args": ["-y", "swarm-marketplace-mcp"],
 *         "env": { "SWARM_API_URL": "https://swarm-psi.vercel.app" }
 *       }
 *     }
 *   }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SWARM_MCP_TOOLS, SWARM_MCP_VERSION } from "./tools.js";
import {
  getUpdateStatus,
  startBackgroundCheck,
  updateBanner,
} from "./updateCheck.js";
import { getOrCreateKey, swarmApiUrl, swarmFetch, usdcBalance } from "./session.js";

const SWARM_API = swarmApiUrl();

interface MarketplaceAgent {
  id: string;
  name: string;
  skill: string;
  price: string;
  address: string;
  type: "ai" | "custom_skill" | "human_expert";
  reputation: { count: number; averageScore: number };
  totalCalls: number;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * Tracks agents/tasks that received a final response this session but
 * haven't been rated. Used only to append a gentle reminder on later
 * tool responses — it never blocks. Ratings are encouraged, not gated.
 */
const pendingRatings = new Map<string, number>();
const pendingTaskRatings = new Set<string>();

function pendingSummary() {
  return Array.from(pendingRatings.entries())
    .map(([id, n]) => `${id}${n > 1 ? ` (×${n})` : ""}`)
    .join(", ");
}

function pendingTaskSummary() {
  return Array.from(pendingTaskRatings).join(", ");
}

function hasPending() {
  return pendingRatings.size > 0 || pendingTaskRatings.size > 0;
}

function pendingReminder() {
  if (!hasPending()) return "";
  const parts: string[] = [];
  if (pendingRatings.size > 0) {
    parts.push(`agents [${pendingSummary()}] · rate 1-5 via \`swarm_rate_agent\``);
  }
  if (pendingTaskRatings.size > 0) {
    parts.push(`tasks [${pendingTaskSummary()}] · rate 1-5 via \`swarm_rate_human_task\``);
  }
  return `\n\n⭐ Pending ratings (optional but please do): ${parts.join("; ")}.`;
}

function withBanner(text: string): string {
  const banner = updateBanner();
  return banner ? `${banner}\n\n${text}` : text;
}

function textResponse(text: string) {
  return { content: [{ type: "text", text: withBanner(text) }] };
}

const server = new Server(
  {
    name: "swarm-marketplace",
    version: SWARM_MCP_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: SWARM_MCP_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const toolArgs = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "swarm_list_agents": {
        const res = await swarmFetch(`/api/agents`);
        let agents = (await res.json()) as MarketplaceAgent[];
        if (typeof toolArgs.skill_filter === "string") {
          const filter = toolArgs.skill_filter.toLowerCase();
          agents = agents.filter((agent) => agent.skill.toLowerCase().includes(filter));
        }
        if (typeof toolArgs.min_reputation === "number") {
          const minReputation = toolArgs.min_reputation;
          agents = agents.filter(
            (agent) => agent.reputation.averageScore >= minReputation,
          );
        }
        return textResponse(JSON.stringify(agents, null, 2));
      }

      case "swarm_ask_agent": {
        const agentId = String(toolArgs.agent_id);
        const body: Record<string, unknown> = {
          agentId,
          question: toolArgs.question,
        };
        const res = await swarmFetch(`/api/guidance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return textResponse(formatAskOrFollowUp(agentId, data, res.ok));
      }

      case "swarm_follow_up": {
        const conversationId = String(toolArgs.conversation_id);
        const reply = String(toolArgs.reply ?? "");
        // Look up the agent via the root turn so the route can re-validate.
        // The GET endpoint returns a flat `agentId` but the POST endpoint
        // returns a nested `agent.id` — tolerate both so shape drift doesn't
        // break follow-ups.
        const root = await swarmFetch(`/api/guidance/${conversationId}`);
        const rootData = (await root.json()) as {
          agent?: { id?: string };
          agentId?: string;
          error?: string;
        };
        const agentId = rootData?.agent?.id ?? rootData?.agentId;
        if (!agentId) {
          return textResponse(
            `Error: could not resolve agent for conversation_id="${conversationId}". ` +
              `Response: ${JSON.stringify(rootData)}`,
          );
        }
        const body: Record<string, unknown> = {
          agentId,
          question: reply,
          conversationId,
        };
        const res = await swarmFetch(`/api/guidance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return textResponse(formatAskOrFollowUp(agentId, data, res.ok));
      }

      case "swarm_get_guidance": {
        const requestId = String(toolArgs.request_id);
        const res = await swarmFetch(`/api/guidance/${requestId}`);
        const data = await res.json();
        const hint =
          data?.status === "ready"
            ? "\n\n✓ ready — read `response`."
            : data?.status === "failed"
              ? "\n\n✗ failed — see `errorMessage`."
              : "\n\n⟶ still pending. Wait ~10 seconds and call this tool again with the same request_id.";
        return textResponse(JSON.stringify(data, null, 2) + hint + pendingReminder());
      }

      case "swarm_rate_agent": {
        const agentId = String(toolArgs.agent_id);
        const res = await swarmFetch(`/api/agents/${agentId}/rate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score: toolArgs.score }),
        });
        const data = await res.json();
        if (res.ok) {
          const cur = pendingRatings.get(agentId) ?? 0;
          if (cur <= 1) {
            pendingRatings.delete(agentId);
          } else {
            pendingRatings.set(agentId, cur - 1);
          }
        }
        const tail = hasPending() ? pendingReminder() : "\n\n✓ All ratings complete.";
        return textResponse(JSON.stringify(data, null, 2) + tail);
      }

      case "swarm_post_human_task": {
        const body: Record<string, unknown> = {
          description: toolArgs.description,
          bounty: toolArgs.bounty,
          skill: toolArgs.skill,
          // postedBy is derived server-side from the paired session
        };
        if (typeof toolArgs.payload === "string") body.payload = toolArgs.payload;
        if (typeof toolArgs.assigned_to === "string") body.assignedTo = toolArgs.assigned_to;
        if (typeof toolArgs.required_skill === "string") body.requiredSkill = toolArgs.required_skill;
        if (typeof toolArgs.min_reputation === "number") body.minReputation = toolArgs.min_reputation;
        if (toolArgs.expert_only === true) body.expertOnly = true;
        if (toolArgs.visibility === "public" || toolArgs.visibility === "private") {
          body.visibility = toolArgs.visibility;
        }
        const res = await swarmFetch(`/api/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        const reminder =
          "\n\n⟶ Remember the returned `id` and poll `swarm_get_human_task` until status is `completed`.";
        return textResponse(JSON.stringify(data, null, 2) + reminder + pendingReminder());
      }

      case "swarm_get_human_task": {
        const taskId = String(toolArgs.task_id);
        const res = await swarmFetch(`/api/tasks/${taskId}`);
        const data = await res.json();
        let hint = "";
        if (data && typeof data === "object") {
          const status = (data as { status?: string }).status;
          const posterRating = (data as { posterRating?: number | null }).posterRating;
          if (status === "completed" && (posterRating == null || posterRating === 0)) {
            pendingTaskRatings.add(taskId);
            hint =
              `\n\n✓ completed — please rate via ` +
              `swarm_rate_human_task(task_id="${taskId}", score 1-5) ` +
              `so the claimer's reputation stays honest.`;
          } else if (status === "completed" && posterRating) {
            pendingTaskRatings.delete(taskId);
          }
        }
        return textResponse(JSON.stringify(data, null, 2) + hint + pendingReminder());
      }

      case "swarm_rate_human_task": {
        const taskId = String(toolArgs.task_id);
        const res = await swarmFetch(`/api/tasks/${taskId}/rate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score: toolArgs.score }),
        });
        const data = await res.json();
        if (res.ok) {
          pendingTaskRatings.delete(taskId);
        }
        const tail = hasPending() ? pendingReminder() : "\n\n✓ All ratings complete.";
        return textResponse(JSON.stringify(data, null, 2) + tail);
      }

      case "swarm_generate_image": {
        const agentId = String(toolArgs.agent_id);
        const body: Record<string, unknown> = {
          agentId,
          prompt: toolArgs.prompt,
        };
        const res = await swarmFetch(`/api/image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as Record<string, unknown>;
        if (res.ok) {
          pendingRatings.set(agentId, (pendingRatings.get(agentId) ?? 0) + 1);
        }
        const payload = data as {
          imageUrl?: string;
          imageBase64?: string;
          mimeType?: string;
          status?: string;
        };

        // Strip the large base64 blob out of the JSON text dump — it
        // becomes an inline image content block below so Claude / Codex
        // actually *see* the image instead of just a URL string.
        const textData: Record<string, unknown> = { ...data };
        delete textData.imageBase64;

        const tail = res.ok
          ? `\n\n✓ Image ready${payload.imageUrl ? ` at ${payload.imageUrl}` : ""}. ` +
            `The image is attached inline below; the URL above is shareable. ` +
            `Rate via \`swarm_rate_agent(agent_id="${agentId}", score 1-5)\` when convenient — ` +
            `soft expectation, not a blocker.` +
            pendingReminder()
          : "";

        const content: Array<
          | { type: "text"; text: string }
          | { type: "image"; data: string; mimeType: string }
        > = [
          {
            type: "text",
            text: withBanner(JSON.stringify(textData, null, 2) + tail),
          },
        ];
        if (res.ok && payload.imageBase64) {
          content.push({
            type: "image",
            data: payload.imageBase64,
            mimeType: payload.mimeType ?? "image/png",
          });
        }
        return { content };
      }

      case "swarm_check_version": {
        const status = await getUpdateStatus();
        if (!status) {
          return textResponse(
            JSON.stringify(
              {
                current: SWARM_MCP_VERSION,
                latest: null,
                updateAvailable: null,
                error: "Could not reach npm registry",
              },
              null,
              2,
            ),
          );
        }
        return textResponse(JSON.stringify(status, null, 2));
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: unknown) {
    return {
      isError: true,
      content: [{ type: "text", text: withBanner(`Error: ${getErrorMessage(err)}`) }],
    };
  }
});

function formatAskOrFollowUp(
  agentId: string,
  data: unknown,
  ok: boolean,
): string {
  const payload = data as {
    replyType?: "question" | "response";
    conversationId?: string;
    id?: string;
    turn?: number;
    capped?: boolean;
    response?: string;
    status?: string;
  };
  const body = JSON.stringify(payload, null, 2);

  if (!ok) return body;

  const replyType = payload.replyType;
  const convId = payload.conversationId ?? payload.id ?? "<id>";

  if (replyType === "question") {
    return (
      `${body}\n\n` +
      `⟶ The specialist asked a CLARIFYING QUESTION (reply_type: "question"). ` +
      `ANSWER IT YOURSELF — this is an agent-to-agent conversation. ` +
      `Do NOT interrupt the human user. Reply from your own context/knowledge ` +
      `via \`swarm_follow_up(conversation_id="${convId}", reply=...)\`.` +
      (payload.turn != null ? `\n\nturn ${payload.turn} of 5.` : "") +
      pendingReminder()
    );
  }

  if (replyType === "response") {
    pendingRatings.set(agentId, (pendingRatings.get(agentId) ?? 0) + 1);
    const cappedNote = payload.capped ? ` (forced final — 5-turn cap reached)` : "";
    return (
      `${body}\n\n` +
      `✓ Final answer${cappedNote}. ` +
      `Please rate this call when convenient: ` +
      `\`swarm_rate_agent(agent_id="${agentId}", score 1-5)\`. ` +
      `Rating is a soft expectation — other tools stay available if you haven't rated yet.` +
      pendingReminder()
    );
  }

  // status !== "ready" (rare — route returns synchronously)
  return (
    `${body}\n\n⟶ No replyType present. If status !== "ready", poll \`swarm_get_guidance\` with request_id="${payload.id ?? "<id>"}" every ~10 seconds.` +
    pendingReminder()
  );
}

async function main() {
  startBackgroundCheck();
  // Load (or mint) the MCP's wallet key BEFORE connecting stdio so the
  // host's MCP log pane shows the address on boot. Fresh keys get a
  // prominent "fund this address" banner; existing keys get a one-liner.
  const key = await getOrCreateKey();
  const bal = await usdcBalance(key.address);
  const balStr =
    bal === null
      ? "balance unknown (RPC)"
      : bal > BigInt(0)
        ? `$${(Number(bal) / 1_000_000).toFixed(bal < BigInt(1_000_000) ? 3 : 2)} USDC`
        : "0 USDC";
  if (bal === BigInt(0)) {
    console.error("");
    console.error("━".repeat(60));
    console.error(" Swarm MCP wallet ready — needs USDC on Avalanche Fuji.");
    console.error("");
    console.error(`   Address:  ${key.address}`);
    console.error(`   Network:  Fuji (eip155:43113) · USDC`);
    console.error(`   Faucet:   https://faucet.circle.com/`);
    console.error("");
    console.error(" Every paid tool call signs an EIP-3009 transfer and");
    console.error(" settles via x402 in ~2s. Fund this address to start.");
    console.error("━".repeat(60));
    console.error("");
  } else {
    console.error(`Swarm MCP wallet: ${key.address} · ${balStr}`);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Swarm MCP server ready · v${SWARM_MCP_VERSION} · API: ${SWARM_API}`);
}

// `npx -y swarm-marketplace-mcp pair` → interactive pairing CLI in the
// user's terminal. Everything else (no args, or spawned by a host) →
// stdio MCP server mode.
if (process.argv[2] === "pair") {
  const { runInteractivePair } = await import("./pair.js");
  const exitCode = await runInteractivePair();
  process.exit(exitCode);
} else if (process.argv[2] === "unpair") {
  const { runInteractiveUnpair } = await import("./unpair.js");
  const exitCode = await runInteractiveUnpair();
  process.exit(exitCode);
} else {
  main().catch((err: unknown) => {
    console.error("Fatal error:", getErrorMessage(err));
    process.exit(1);
  });
}
