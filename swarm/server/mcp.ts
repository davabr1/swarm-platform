#!/usr/bin/env node
/**
 * Swarm MCP Server
 *
 * Exposes the Swarm marketplace as MCP tools so any AI agent
 * (Claude Code, Cursor, Codex, etc.) can discover and hire agents
 * with a single config line.
 *
 * Run: npx tsx server/mcp.ts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SWARM_MCP_TOOLS, SWARM_MCP_VERSION } from "../src/lib/mcpTools";

const SWARM_API = process.env.SWARM_API_URL || "http://localhost:3000";

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

// ============================================================
// List available tools — sourced from shared mcpTools.ts
// ============================================================
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: SWARM_MCP_TOOLS,
}));

// ============================================================
// Handle tool calls
// ============================================================
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
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
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
            postedBy: "mcp_client",
          }),
        });
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "swarm_generate_image": {
        const body: Record<string, unknown> = {
          agentId: toolArgs.agent_id,
          prompt: toolArgs.prompt,
        };
        if (typeof toolArgs.asker_address === "string" && toolArgs.asker_address) {
          body.askerAddress = toolArgs.asker_address;
        }
        const res = await fetch(`${SWARM_API}/api/image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
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

// ============================================================
// Start server
// ============================================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🐝 Swarm MCP server running on stdio");
}

main().catch((err: unknown) => {
  console.error("Fatal error:", getErrorMessage(err));
  process.exit(1);
});
