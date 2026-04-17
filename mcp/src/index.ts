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
 * Tracks agents that have been asked this session but not yet rated.
 * Every swarm_ask_agent increments; every swarm_rate_agent decrements.
 * Also tracks human tasks that completed but haven't been rated yet —
 * swarm_get_human_task adds completed+unrated task ids; swarm_rate_human_task
 * removes them. While either collection is non-empty, all other tools
 * (except swarm_get_guidance and swarm_get_human_task, which must stay
 * callable so polling never deadlocks) return a blocking error telling
 * the caller to rate.
 */
const pendingRatings = new Map<string, number>();
const pendingTaskRatings = new Set<string>();

const RATE_EXEMPT_TOOLS = new Set([
  "swarm_rate_agent",
  "swarm_rate_human_task",
  "swarm_get_guidance",
  "swarm_get_human_task",
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
  return {
    isError: true,
    content: [
      {
        type: "text",
        text:
          `⛔ Blocked: ${parts.join("; ")}. ` +
          `Rate everything before using any other Swarm tool (except ` +
          `\`swarm_get_guidance\` and \`swarm_get_human_task\`, which stay ` +
          `available so polling doesn't deadlock). Silence is indistinguishable from 1-star.`,
      },
    ],
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
        return {
          content: [{ type: "text", text: JSON.stringify(agents, null, 2) }],
        };
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
        if (res.ok) {
          pendingRatings.set(agentId, (pendingRatings.get(agentId) ?? 0) + 1);
        }
        const reminder =
          `\n\n⛔ BLOCKING: before any other Swarm tool (except swarm_get_guidance / swarm_get_human_task), ` +
          `you MUST call swarm_rate_agent with agent_id="${agentId}" and a score 1-5. ` +
          `Current pending: [${pendingSummary()}]. ` +
          `\n\n⟶ If status !== "ready" above, poll swarm_get_guidance with request_id="${data?.id ?? "<id>"}" every ~10 seconds until ready.`;
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) + reminder }],
        };
      }

      case "swarm_get_guidance": {
        const requestId = String(toolArgs.request_id);
        const res = await fetch(`${SWARM_API}/api/guidance/${requestId}`);
        const data = await res.json();
        const hint =
          data?.status === "ready"
            ? "\n\n✓ ready — read `response`. Remember: swarm_rate_agent is still required before other tools unblock."
            : data?.status === "failed"
              ? "\n\n✗ failed — see `errorMessage`. swarm_rate_agent still required to clear the pending counter."
              : "\n\n⟶ still pending. Wait ~10 seconds and call this tool again with the same request_id.";
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) + hint }],
        };
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
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) + remaining }],
        };
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
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) + reminder }],
        };
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
              `before any other Swarm tool (except swarm_get_guidance / swarm_get_human_task).`;
          } else if (status === "completed" && posterRating) {
            pendingTaskRatings.delete(taskId);
          }
        }
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) + hint }],
        };
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
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) + remaining }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: unknown) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${getErrorMessage(err)}` }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Swarm MCP server ready · v${SWARM_MCP_VERSION} · API: ${SWARM_API}`);
}

main().catch((err: unknown) => {
  console.error("Fatal error:", getErrorMessage(err));
  process.exit(1);
});
