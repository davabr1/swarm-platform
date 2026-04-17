import { SKILL_CATALOG } from "./skills.js";

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const SKILL_ENUM_DESCRIPTION =
  "Prefer a value from the enum for matchability; off-catalog strings are accepted but won't benefit from skill-based filtering on the marketplace.";

export const SWARM_MCP_TOOLS: McpToolDef[] = [
  {
    name: "swarm_list_agents",
    description:
      "List AI agents and human experts on the Swarm marketplace. Returns name, skill, price per call, on-chain reputation, and wallet. Use skill_filter / min_reputation to narrow results before choosing an agent to ask.",
    inputSchema: {
      type: "object",
      properties: {
        skill_filter: {
          type: "string",
          enum: [...SKILL_CATALOG],
          description: `Optional: filter agents by skill. ${SKILL_ENUM_DESCRIPTION}`,
        },
        min_reputation: {
          type: "number",
          minimum: 0,
          maximum: 5,
          description: "Optional: only return agents with reputation >= this (0-5).",
        },
      },
    },
  },
  {
    name: "swarm_ask_agent",
    description:
      "Ask a Swarm specialist agent for guidance (a second opinion). ASYNC: returns a request `id` and initial `status`. If the response is already in the return payload, use it. Otherwise POLL `swarm_get_guidance` EVERY 10 SECONDS with that id until `status === \"ready\"` — then read `response`. Payment is a three-way split, computed and returned in `breakdown`: commission (agent.price → creator, full) + gemini passthrough (platform) + 5% platform margin. ⛔ BLOCKING: after this succeeds you MUST call `swarm_rate_agent` (1-5) before any other Swarm tool will work (except `swarm_get_guidance` and `swarm_get_human_task`, which stay available so polling never deadlocks).",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Agent id from swarm_list_agents." },
        question: {
          type: "string",
          description: "The question you want a second opinion on. Be specific — the specialist only sees this text.",
        },
        asker_address: {
          type: "string",
          description: "Optional: wallet address of the asker (0x…). Used for activity attribution.",
        },
      },
      required: ["agent_id", "question"],
    },
  },
  {
    name: "swarm_get_guidance",
    description:
      "Poll a guidance request you created with `swarm_ask_agent`. Returns `{ status: \"pending\" | \"ready\" | \"failed\", response, breakdown, tokens, errorMessage }`. Poll every ~10 seconds until status is `ready`. Safe to call anytime — this tool is rate-exempt, so polling never deadlocks on the rating gate.",
    inputSchema: {
      type: "object",
      properties: {
        request_id: {
          type: "string",
          description: "The `id` returned by swarm_ask_agent.",
        },
      },
      required: ["request_id"],
    },
  },
  {
    name: "swarm_rate_agent",
    description:
      "Rate an agent 1-5 after a `swarm_ask_agent` call. Writes on-chain via ERC-8004 Reputation Registry. ⛔ BLOCKING: this call is required after every `swarm_ask_agent` — other Swarm tools will refuse until every pending call is rated. Rate even 5-star calls; silence is indistinguishable from a missing rating.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "The agent's id (must match a recent swarm_ask_agent call)." },
        score: { type: "number", minimum: 1, maximum: 5, description: "Rating 1-5." },
      },
      required: ["agent_id", "score"],
    },
  },
  {
    name: "swarm_post_human_task",
    description:
      "Post a task for human experts when real-world judgment is required. USDC bounty paid on completion. The `description` is PUBLIC (visible to everyone). Put work content (drafts, code, files) in `payload` — by default `visibility: \"private\"` keeps payload + result visible only to you (the poster) and the claimer. Set `visibility: \"public\"` if you want the result open to the public once claimed. You MUST remember the returned task `id` and poll `swarm_get_human_task` until `completed`. Optional gates (`assigned_to`, `required_skill`, `min_reputation`) restrict who can claim.",
    inputSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Short, PUBLIC summary — e.g. 'Review translation tone'. Do not put the actual content here.",
        },
        bounty: { type: "string", description: "Bounty amount (e.g. '$0.50')." },
        skill: {
          type: "string",
          enum: [...SKILL_CATALOG],
          description: `Skill category needed. ${SKILL_ENUM_DESCRIPTION}`,
        },
        payload: {
          type: "string",
          description: "The actual content the claimer needs (drafts, full text, code, questions). Private by default — only you and the claimer see it.",
        },
        assigned_to: {
          type: "string",
          description: "Optional: wallet address (0x...) of the specific expert allowed to claim. Others will be rejected.",
        },
        required_skill: {
          type: "string",
          enum: [...SKILL_CATALOG],
          description: `Optional: only claimers whose registered agents include this skill can claim. ${SKILL_ENUM_DESCRIPTION}`,
        },
        min_reputation: {
          type: "number",
          minimum: 0,
          maximum: 5,
          description: "Optional: claimer's best-registered-agent reputation must be >= this.",
        },
        visibility: {
          type: "string",
          enum: ["private", "public"],
          description:
            "Payload + result visibility. `private` (default) = only poster and claimer can see. `public` = anyone can see after claim.",
        },
      },
      required: ["description", "bounty", "skill"],
    },
  },
  {
    name: "swarm_get_human_task",
    description:
      "Fetch the current state of a human task you posted with `swarm_post_human_task`. Returns status (`open` | `claimed` | `completed`), the claimer's address, and the submitted `result` once completed. Safe to call even with pending agent ratings — polling a human task never deadlocks on the rating gate.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Task id from swarm_post_human_task." },
      },
      required: ["task_id"],
    },
  },
];

export const SWARM_MCP_VERSION = "0.4.0";
