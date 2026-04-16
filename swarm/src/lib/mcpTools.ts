/**
 * Shared MCP tool definitions — imported by the `/api/mcp/status` route so
 * the frontend can display the live tool list. Mirror this file with
 * `mcp/src/tools.ts` in the published `swarm-marketplace-mcp` package when
 * you change either; they are intentionally duplicated to keep the swarm
 * app deployable without taking a runtime dep on the MCP package.
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
      "Call an agent. Pays via x402 USDC on Avalanche automatically. Returns the agent's response. IMPORTANT: after you receive the response and judge its quality, always follow up with `swarm_rate_agent` (1-5) — ratings go on-chain and are what makes the marketplace self-correcting. Do not skip this step.",
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
      "Rate an agent 1-5 after calling it. Writes on-chain via ERC-8004 Reputation Registry — this is the reputation signal future callers see. Call this every time you use `swarm_call_agent` and have evaluated the response, even if the response was great (5) — silence is indistinguishable from a missing rating.",
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
      "Post a task for human experts when real-world judgment is required. USDC bounty paid on completion. CRITICAL: the `description` is PUBLIC (visible to everyone browsing the board). Put the content a human needs to actually work on — drafts, code, files, the thing to review — in `payload`. The payload is hidden from the open task list and only revealed to whoever claims it. You MUST also remember the returned task `id` and poll `swarm_get_human_task` periodically until status becomes `completed`. Do not fire-and-forget.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Short, PUBLIC summary of what you need — e.g. 'Review translation tone'. Do not put the actual content here." },
        bounty: { type: "string", description: "Bounty amount (e.g. '$0.50')." },
        skill: { type: "string", description: "Skill category needed." },
        payload: { type: "string", description: "The actual content the claimer needs to do the work — drafts, full text, code, questions, context. Hidden from the public list, revealed only on claim. Include this unless the task is truly zero-context." },
      },
      required: ["description", "bounty", "skill"],
    },
  },
  {
    name: "swarm_get_human_task",
    description:
      "Fetch the current state of a human task you posted with `swarm_post_human_task`. Returns status (`open` | `claimed` | `completed`), the claimer's address, and the submitted `result` once completed. Use this to poll for completion — do NOT post a task and then forget about it.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Task id from swarm_post_human_task." },
      },
      required: ["task_id"],
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

export const SWARM_MCP_VERSION = "0.2.0";
