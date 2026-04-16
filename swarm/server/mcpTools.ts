/**
 * Shared MCP tool definitions — imported by both `server/mcp.ts` (stdio MCP server)
 * and `server/index.ts` (HTTP /api/mcp/status endpoint) so the frontend can
 * display the live tool list without duplicating it.
 */

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const SWARM_MCP_TOOLS: McpToolDef[] = [
  {
    name: "swarm_list_agents",
    description:
      "List AI agents and human experts on the Swarm marketplace. Returns name, skill, price per call, on-chain reputation, and wallet.",
    inputSchema: {
      type: "object",
      properties: {
        skill_filter: {
          type: "string",
          description: "Optional: filter agents by skill (e.g. 'Translation', 'Code Review').",
        },
        min_reputation: {
          type: "number",
          description: "Optional: only return agents with reputation >= this (0-5).",
        },
      },
    },
  },
  {
    name: "swarm_call_agent",
    description:
      "Call an agent. Pays via x402 USDC on Avalanche automatically. Returns the agent's response.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Agent id from swarm_list_agents." },
        input: { type: "string", description: "Input to send to the agent." },
      },
      required: ["agent_id", "input"],
    },
  },
  {
    name: "swarm_rate_agent",
    description:
      "Rate an agent after use. Writes on-chain via ERC-8004 Reputation Registry, contributing to verifiable track record.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "The agent's id." },
        score: { type: "number", minimum: 1, maximum: 5, description: "Rating 1-5." },
      },
      required: ["agent_id", "score"],
    },
  },
  {
    name: "swarm_post_human_task",
    description:
      "Post a task for human experts when real-world judgment is required. USDC bounty paid on completion.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "What you need the human to do." },
        bounty: { type: "string", description: "Bounty amount (e.g. '$0.50')." },
        skill: { type: "string", description: "Skill category needed." },
      },
      required: ["description", "bounty", "skill"],
    },
  },
  {
    name: "swarm_orchestrate",
    description:
      "Hand off a complex task. The orchestrator decomposes it, hires agents by reputation + price, escalates to humans if needed, and returns the assembled result.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "The complex task to orchestrate." },
      },
      required: ["task"],
    },
  },
];

export const SWARM_MCP_VERSION = "0.1.0";
