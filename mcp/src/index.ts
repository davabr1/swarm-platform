#!/usr/bin/env node
/**
 * Swarm MCP Server
 *
 * Exposes the Swarm marketplace as MCP tools so any AI agent
 * (Claude Code, Cursor, Codex, etc.) can discover and hire agents
 * with a single config line.
 *
 * Config in .mcp.json / claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "swarm": {
 *         "command": "npx",
 *         "args": ["-y", "swarm-mcp"],
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

const server = new Server(
  {
    name: "swarm-marketplace",
    version: SWARM_MCP_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
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
        const res = await fetch(`${SWARM_API}/api/agents`);
        let agents = (await res.json()) as MarketplaceAgent[];
        if (typeof toolArgs.skill_filter === "string") {
          const filter = toolArgs.skill_filter.toLowerCase();
          agents = agents.filter((agent) => agent.skill.toLowerCase().includes(filter));
        }
        if (typeof toolArgs.min_reputation === "number") {
          const minReputation = toolArgs.min_reputation;
          agents = agents.filter(
            (agent) => agent.reputation.averageScore >= minReputation
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(agents, null, 2) }],
        };
      }

      case "swarm_call_agent": {
        const res = await fetch(`${SWARM_API}/api/agents/${toolArgs.agent_id}/call`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: toolArgs.input }),
        });
        const data = await res.json();
        const reminder = `\n\n⟶ Once you've judged the quality of this response, call \`swarm_rate_agent\` with agent_id="${toolArgs.agent_id}" and a score 1-5. Ratings go on-chain and are how future callers find good agents.`;
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) + reminder }],
        };
      }

      case "swarm_rate_agent": {
        const res = await fetch(`${SWARM_API}/api/agents/${toolArgs.agent_id}/rate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score: toolArgs.score }),
        });
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "swarm_post_human_task": {
        const res = await fetch(`${SWARM_API}/api/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: toolArgs.description,
            bounty: toolArgs.bounty,
            skill: toolArgs.skill,
            payload: typeof toolArgs.payload === "string" ? toolArgs.payload : undefined,
            postedBy: "mcp_client",
          }),
        });
        const data = await res.json();
        // Nudge the caller to actually poll — the tool description also says
        // this, but repeating it in the return payload makes it harder to
        // ignore.
        const reminder =
          "\n\n⟶ Remember the returned `id` and poll `swarm_get_human_task` until status is `completed`. Do not drop this task.";
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) + reminder }],
        };
      }

      case "swarm_get_human_task": {
        const res = await fetch(`${SWARM_API}/api/tasks/${toolArgs.task_id}`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "swarm_orchestrate": {
        const res = await fetch(`${SWARM_API}/api/orchestrate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task: toolArgs.task }),
        });
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
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
  console.error(`Swarm MCP server ready · API: ${SWARM_API}`);
}

main().catch((err: unknown) => {
  console.error("Fatal error:", getErrorMessage(err));
  process.exit(1);
});
