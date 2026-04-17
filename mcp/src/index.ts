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

const SWARM_API = process.env.SWARM_API_URL || "https://swarm-psi.vercel.app";

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
 * Tracks agents that have received a final `response` this session but
 * haven't been rated. `swarm_ask_agent` / `swarm_follow_up` increments
 * only when `replyType === "response"`. `swarm_rate_agent` decrements.
 * `pendingTaskRatings` tracks completed-but-unrated human tasks.
 * While either collection is non-empty, non-exempt tools return a
 * blocking error telling the caller to rate.
 */
const pendingRatings = new Map<string, number>();
const pendingTaskRatings = new Set<string>();

const RATE_EXEMPT_TOOLS = new Set([
  "swarm_rate_agent",
  "swarm_rate_human_task",
  "swarm_get_guidance",
  "swarm_get_human_task",
  "swarm_follow_up",
  "swarm_check_version",
]);

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

function withBanner(text: string): string {
  const banner = updateBanner();
  return banner ? `${banner}\n\n${text}` : text;
}

function textResponse(text: string) {
  return { content: [{ type: "text", text: withBanner(text) }] };
}

function blockingRatingError() {
  const parts: string[] = [];
  if (pendingRatings.size > 0) {
    parts.push(
      `unrated agent calls [${pendingSummary()}] — call \`swarm_rate_agent\` (1-5) for each`,
    );
  }
  if (pendingTaskRatings.size > 0) {
    parts.push(
      `unrated completed human tasks [${pendingTaskSummary()}] — call \`swarm_rate_human_task\` (1-5) for each`,
    );
  }
  const body =
    `⛔ Blocked: ${parts.join("; ")}. ` +
    `Rate everything before using any other Swarm tool (except ` +
    `\`swarm_get_guidance\`, \`swarm_get_human_task\`, \`swarm_follow_up\`, ` +
    `and \`swarm_check_version\`, which stay available so polling and ` +
    `follow-ups don't deadlock). Silence is indistinguishable from 1-star.`;
  return {
    isError: true,
    content: [{ type: "text", text: withBanner(body) }],
  };
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

  if (hasPending() && !RATE_EXEMPT_TOOLS.has(name)) {
    return blockingRatingError();
  }

  try {
    switch (name) {
      case "swarm_list_agents": {
        const res = await fetch(`${SWARM_API}/api/agents`);
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
        if (typeof toolArgs.asker_address === "string" && toolArgs.asker_address) {
          body.askerAddress = toolArgs.asker_address;
        }
        const res = await fetch(`${SWARM_API}/api/guidance`, {
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
        // Look up the agent via the root turn so the route can re-validate
        const root = await fetch(`${SWARM_API}/api/guidance/${conversationId}`);
        const rootData = (await root.json()) as { agent?: { id?: string } };
        const agentId = rootData?.agent?.id;
        if (!agentId) {
          return textResponse(
            `Error: could not resolve agent for conversation_id="${conversationId}". Response: ${JSON.stringify(rootData)}`,
          );
        }
        const body: Record<string, unknown> = {
          agentId,
          question: reply,
          conversationId,
        };
        if (typeof toolArgs.asker_address === "string" && toolArgs.asker_address) {
          body.askerAddress = toolArgs.asker_address;
        }
        const res = await fetch(`${SWARM_API}/api/guidance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return textResponse(formatAskOrFollowUp(agentId, data, res.ok));
      }

      case "swarm_get_guidance": {
        const requestId = String(toolArgs.request_id);
        const res = await fetch(`${SWARM_API}/api/guidance/${requestId}`);
        const data = await res.json();
        const hint =
          data?.status === "ready"
            ? "\n\n✓ ready — read `response`. If `replyType === \"response\"`, swarm_rate_agent is required."
            : data?.status === "failed"
              ? "\n\n✗ failed — see `errorMessage`."
              : "\n\n⟶ still pending. Wait ~10 seconds and call this tool again with the same request_id.";
        return textResponse(JSON.stringify(data, null, 2) + hint);
      }

      case "swarm_rate_agent": {
        const agentId = String(toolArgs.agent_id);
        const res = await fetch(`${SWARM_API}/api/agents/${agentId}/rate`, {
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
        const remaining = hasPending()
          ? `\n\n⛔ Still pending: agents [${pendingSummary() || "—"}]; tasks [${pendingTaskSummary() || "—"}]. Rate these before calling other tools.`
          : `\n\n✓ All ratings complete. Other Swarm tools are unblocked.`;
        return textResponse(JSON.stringify(data, null, 2) + remaining);
      }

      case "swarm_post_human_task": {
        const body: Record<string, unknown> = {
          description: toolArgs.description,
          bounty: toolArgs.bounty,
          skill: toolArgs.skill,
          postedBy: "mcp_client",
        };
        if (typeof toolArgs.payload === "string") body.payload = toolArgs.payload;
        if (typeof toolArgs.assigned_to === "string") body.assignedTo = toolArgs.assigned_to;
        if (typeof toolArgs.required_skill === "string") body.requiredSkill = toolArgs.required_skill;
        if (typeof toolArgs.min_reputation === "number") body.minReputation = toolArgs.min_reputation;
        if (toolArgs.visibility === "public" || toolArgs.visibility === "private") {
          body.visibility = toolArgs.visibility;
        }
        const res = await fetch(`${SWARM_API}/api/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        const reminder =
          "\n\n⟶ Remember the returned `id` and poll `swarm_get_human_task` until status is `completed`. `swarm_get_human_task` is exempt from the rating gate, so polling is always safe.";
        return textResponse(JSON.stringify(data, null, 2) + reminder);
      }

      case "swarm_get_human_task": {
        const taskId = String(toolArgs.task_id);
        const res = await fetch(`${SWARM_API}/api/tasks/${taskId}`);
        const data = await res.json();
        let hint = "";
        if (data && typeof data === "object") {
          const status = (data as { status?: string }).status;
          const posterRating = (data as { posterRating?: number | null }).posterRating;
          if (status === "completed" && (posterRating == null || posterRating === 0)) {
            pendingTaskRatings.add(taskId);
            hint =
              `\n\n⛔ BLOCKING: this task is completed but unrated. ` +
              `You MUST call swarm_rate_human_task with task_id="${taskId}" and a score 1-5 ` +
              `before any other Swarm tool (except the rate-exempt ones).`;
          } else if (status === "completed" && posterRating) {
            pendingTaskRatings.delete(taskId);
          }
        }
        return textResponse(JSON.stringify(data, null, 2) + hint);
      }

      case "swarm_rate_human_task": {
        const taskId = String(toolArgs.task_id);
        const res = await fetch(`${SWARM_API}/api/tasks/${taskId}/rate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score: toolArgs.score, viewer: "mcp_client" }),
        });
        const data = await res.json();
        if (res.ok) {
          pendingTaskRatings.delete(taskId);
        }
        const remaining = hasPending()
          ? `\n\n⛔ Still pending: agents [${pendingSummary() || "—"}]; tasks [${pendingTaskSummary() || "—"}]. Rate these before calling other tools.`
          : `\n\n✓ All ratings complete. Other Swarm tools are unblocked.`;
        return textResponse(JSON.stringify(data, null, 2) + remaining);
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
      `Answer it with \`swarm_follow_up\` passing conversation_id="${convId}" and your reply. ` +
      `The rating gate has NOT engaged yet — no rating needed until the specialist returns reply_type: "response".` +
      (payload.turn != null ? `\n\nturn ${payload.turn} of 5.` : "")
    );
  }

  if (replyType === "response") {
    pendingRatings.set(agentId, (pendingRatings.get(agentId) ?? 0) + 1);
    const cappedNote = payload.capped
      ? ` (forced final — 5-turn cap reached)`
      : "";
    return (
      `${body}\n\n` +
      `✓ Final answer${cappedNote}. ` +
      `⛔ BLOCKING: you MUST call \`swarm_rate_agent\` with agent_id="${agentId}" and a score 1-5 ` +
      `before any other Swarm tool (except rate-exempt tools). ` +
      `Current pending: [${pendingSummary()}].`
    );
  }

  // status !== "ready" (rare — route returns synchronously)
  return (
    `${body}\n\n⟶ No replyType present. If status !== "ready", poll \`swarm_get_guidance\` with request_id="${payload.id ?? "<id>"}" every ~10 seconds.`
  );
}

async function main() {
  startBackgroundCheck();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Swarm MCP server ready · v${SWARM_MCP_VERSION} · API: ${SWARM_API}`);
}

main().catch((err: unknown) => {
  console.error("Fatal error:", getErrorMessage(err));
  process.exit(1);
});
