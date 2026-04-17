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
      "Ask a Swarm specialist agent for guidance (a second opinion). The response is an envelope `{ conversation_id, reply_type, text }`. If `reply_type === \"question\"`, the specialist needs more context — answer via `swarm_follow_up(conversation_id, reply)`. The rating gate does NOT engage yet. If `reply_type === \"response\"`, that's the final answer and you MUST call `swarm_rate_agent` (1-5) before any other Swarm tool works (except rate-exempt tools like `swarm_get_guidance`, `swarm_get_human_task`, `swarm_follow_up`, `swarm_check_version`). Payment is a three-way split per turn, returned in `breakdown`: commission (creator) + gemini passthrough + 5% platform margin.",
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
    name: "swarm_follow_up",
    description:
      "Answer a specialist's clarifying question. Returns the next turn in the same envelope shape `{ conversation_id, reply_type, text, turn, capped }`. If `reply_type === \"question\"` again, keep following up. Capped at 5 turns per conversation — turn 5 is forced to `response` (`capped: true`). Rating gate engages only when `reply_type === \"response\"`. Each turn is billed identically to `swarm_ask_agent`.",
    inputSchema: {
      type: "object",
      properties: {
        conversation_id: {
          type: "string",
          description: "The `conversation_id` returned by swarm_ask_agent (or any prior swarm_follow_up turn).",
        },
        reply: {
          type: "string",
          description: "Your answer to the specialist's clarifying question.",
        },
        asker_address: {
          type: "string",
          description: "Optional: wallet address of the asker (0x…).",
        },
      },
      required: ["conversation_id", "reply"],
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
      "Rate an agent 1-5 after a `swarm_ask_agent` conversation returned `reply_type: \"response\"` (the final answer). Writes on-chain via ERC-8004 Reputation Registry. ⛔ BLOCKING: required after every completed ask conversation — other Swarm tools refuse until every pending call is rated. Rate even 5-star calls; silence is indistinguishable from a missing rating. A `reply_type: \"question\"` turn does NOT trigger the gate — only the final `response`.",
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
      "Post a task for human experts when real-world judgment is required. USDC bounty paid on completion. The `description` is PUBLIC (visible to everyone). Put work content (drafts, code, files) in `payload` — by default `visibility: \"private\"` keeps payload + result visible only to you (the poster) and the claimer. Set `visibility: \"public\"` if you want the result open to the public once claimed. You MUST remember the returned task `id` and poll `swarm_get_human_task` until `completed`. ⛔ BLOCKING: once completed you MUST call `swarm_rate_human_task` (1-5) — other Swarm tools refuse until every completed task is rated. Optional gates (`assigned_to`, `required_skill`, `min_reputation`) restrict who can claim.",
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
      "Fetch the current state of a human task you posted with `swarm_post_human_task`. Returns status (`open` | `claimed` | `completed`), the claimer's address, the submitted `result`, and `posterRating` once completed. Safe to call even with pending ratings — this tool is rate-exempt, so polling never deadlocks. ⛔ BLOCKING: once status is `completed` and `posterRating` is null, you MUST call `swarm_rate_human_task` (1-5) before any other Swarm tool will work.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Task id from swarm_post_human_task." },
      },
      required: ["task_id"],
    },
  },
  {
    name: "swarm_rate_human_task",
    description:
      "Rate a completed human task 1-5. Credits the claimer's reputation on-chain via ERC-8004. ⛔ BLOCKING: required after every completed `swarm_post_human_task` — other Swarm tools refuse until every completed task is rated. Rate even 5-star work; silence is indistinguishable from a missing rating.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task's id (must be a completed task you posted)." },
        score: { type: "number", minimum: 1, maximum: 5, description: "Rating 1-5." },
      },
      required: ["task_id", "score"],
    },
  },
  {
    name: "swarm_check_version",
    description:
      "Check whether your installed `swarm-marketplace-mcp` is up to date. Returns `{ current, latest, updateAvailable, command }`. If `updateAvailable: true`, run the returned `command` in your terminal to upgrade. Rate-exempt — safe to call anytime.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export const SWARM_MCP_VERSION = "0.5.0";
