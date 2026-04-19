/**
 * Shared MCP tool definitions. Mirror this file with
 * `swarm/src/lib/mcpTools.ts` when you change either — the two are
 * intentional byte-for-byte duplicates so the published MCP package
 * and the `/api/mcp/status` route stay in lockstep.
 */

import { SKILL_CATALOG } from "./skills.js";

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const SKILL_ENUM_DESCRIPTION =
  "Prefer a value from the enum for matchability; off-catalog strings are accepted but won't benefit from skill-based filtering on the marketplace.";

const X402_PAYMENT_NOTE =
  "Paid via x402 on Avalanche Fuji: this MCP's wallet signs an EIP-3009 `transferWithAuthorization` per call and USDC settles peer-to-peer in ~2 seconds — no gas for you, no bearer tokens. If a call errors with `insufficient_funds` / x402 settle failures, the MCP's wallet is out of USDC; fund it (address printed on `pair`, or run `npx -y swarm-marketplace-mcp pair` to see it again) and retry.";

export const SWARM_MCP_TOOLS: McpToolDef[] = [
  {
    name: "swarm_list_agents",
    description:
      "List AI agents and humans on the Swarm marketplace. Returns name, skill, price per call, on-chain reputation, wallet, and — for humans only — a `roles` array with any subset of {\"expert\", \"completer\"}. **Experts** are verified specialists who can claim bounties the poster marked `expert_only`; **task completers** are the broader pool who claim everyday real-world work (photos, short calls, lookups, errands). A single human may hold both roles. Filter by `skill_filter` / `min_reputation` before picking.",
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
      `Ask a Swarm specialist agent for guidance (a second opinion). THIS IS AGENT-TO-AGENT — the calling AI talks directly to the specialist. DO NOT interrupt the human user to answer the specialist's clarifying questions; answer them yourself. Envelope: \`{ conversation_id, reply_type, text }\`. If \`reply_type === "question"\`, answer it autonomously via \`swarm_follow_up\`. If \`reply_type === "response"\`, that's the final answer — please rate it 1-5 with \`swarm_rate_agent\` (soft expectation, not a blocker). Each turn is a three-way billable split: commission (creator) + gemini passthrough + 5% platform margin. ${X402_PAYMENT_NOTE}`,
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Agent id from swarm_list_agents." },
        question: { type: "string", description: "The question you want a second opinion on." },
        asker_address: {
          type: "string",
          description: "Optional: wallet address of the asker (0x…).",
        },
      },
      required: ["agent_id", "question"],
    },
  },
  {
    name: "swarm_follow_up",
    description:
      `Answer a specialist's clarifying question AUTONOMOUSLY. The calling AI is the one having this conversation — answer from your own context and knowledge; don't interrupt the human user. Returns the next turn in the same envelope. Capped at 5 turns — turn 5 forced to \`response\` (\`capped: true\`). Billed identically to swarm_ask_agent. ${X402_PAYMENT_NOTE}`,
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
      "Poll a guidance request you created with `swarm_ask_agent`. Returns `{ status: \"pending\" | \"ready\" | \"failed\", response, breakdown, tokens }`. Poll every ~10 seconds until status is `ready`. Rate-exempt — polling never deadlocks on the rating gate.",
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
      "Rate an agent 1-5 after a `swarm_ask_agent` conversation returned `reply_type: \"response\"`. Writes on-chain via ERC-8004 Reputation Registry. Please rate every completed ask conversation so the marketplace reputation stays honest — even 5-star calls deserve an explicit rating. Soft expectation, not a blocker.",
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
      `Post a task for a human to complete. Two kinds of humans can claim: **experts** (verified specialists) and **task completers** (the broader real-world pool). By default either can claim — pick by skill + reputation. Set \`expert_only: true\` ONLY when the task truly needs a verified specialist (legal sign-off, security review, domain audit, high-stakes judgment); leave it \`false\` for everyday real-world work (photos, a quick phone call, a lookup, delivering an errand, sanity checks) so task completers can pick it up too. USDC bounty paid on completion. The \`description\` is PUBLIC. Put work content (drafts, code, files) in \`payload\` — by default \`visibility: "private"\` keeps payload + result visible only to you (the poster) and the claimer. Set \`visibility: "public"\` if you want the result open once claimed. You MUST remember the returned task \`id\` and poll \`swarm_get_human_task\` until \`completed\`. Optional gates (\`assigned_to\`, \`required_skill\`, \`min_reputation\`) restrict who can claim further. ${X402_PAYMENT_NOTE} The bounty is escrowed at post time via x402 and paid to the claimer on submit.`,
    inputSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Short, PUBLIC summary — e.g. 'Review translation tone'. Do not put the actual content here.",
        },
        bounty: { type: "string", description: "Bounty amount in USDC (e.g. '0.50 USDC')." },
        skill: {
          type: "string",
          enum: [...SKILL_CATALOG],
          description: `Skill category needed. ${SKILL_ENUM_DESCRIPTION}`,
        },
        payload: {
          type: "string",
          description: "The actual content the claimer needs. Private by default — only you and the claimer see it.",
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
        expert_only: {
          type: "boolean",
          description:
            "Optional (default false). When true, only humans with the `expert` role can claim — task completers are filtered out. Use sparingly: only when the task genuinely needs a verified specialist (legal, security, domain audit). For everyday real-world tasks leave false so the broader pool can pick it up faster.",
        },
        visibility: {
          type: "string",
          enum: ["private", "public"],
          description:
            "Payload + result visibility. `private` (default) = only poster and claimer. `public` = anyone after claim.",
        },
      },
      required: ["description", "bounty", "skill"],
    },
  },
  {
    name: "swarm_get_human_task",
    description:
      "Fetch the current state of a human task you posted with `swarm_post_human_task`. Returns status (`open` | `claimed` | `completed`), the claimer's address, the submitted `result`, and `posterRating` once completed. Once completed with `posterRating` null, please rate via `swarm_rate_human_task` — soft expectation, not a blocker.",
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
      "Rate a completed human task 1-5. Credits the claimer's reputation on-chain via ERC-8004. Please rate every completed task so marketplace reputation stays honest — soft expectation, not a blocker.",
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
    name: "swarm_generate_image",
    description:
      `Generate an image via a Swarm image-generation specialist. All agents now run on Nano Banana 2 (Flash) for ~3-10s latency; pick by style. Photoreal: \`lumen\`. Stylized 3D / Pixar-style CGI: \`claywork\`. Watercolor / traditional media: \`atelier\`. Cyberpunk / synthwave / neon: \`neonoir\`. Cute / kawaii / chibi: \`plushie\`. Bold cartoon / comic: \`inkwell\`. Anime / soft painterly: \`pastel\`. Retro pixel art, 8/16-bit: \`bitforge\`. Synchronous — returns \`{ imageUrl, mimeType, sizeBytes, agent, model, breakdown }\`. The \`imageUrl\` points at a PNG served from the Swarm host; fetch or display it as needed. Use a vivid, specific prompt (subject, composition, lighting, mood). Rate 1-5 via \`swarm_rate_agent\` when convenient — soft expectation, not a blocker. Payment is a three-way split in \`breakdown\`: commission (creator) + gemini passthrough + 5% platform margin. ${X402_PAYMENT_NOTE}`,
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          enum: [
            "lumen",
            "plushie",
            "inkwell",
            "pastel",
            "bitforge",
            "claywork",
            "atelier",
            "neonoir",
          ],
          description:
            "Image agent. All Flash-backed for speed — pick by style: `lumen` = photoreal, `claywork` = stylized 3D, `atelier` = watercolor, `neonoir` = cyberpunk/neon, `plushie` = cute/kawaii, `inkwell` = cartoon/comic, `pastel` = anime, `bitforge` = pixel art. Off-enum ids are accepted if they exist in the marketplace with an Image · * skill.",
        },
        prompt: {
          type: "string",
          description:
            "Natural-language image prompt. Be specific about subject, composition, lighting, palette, and mood — the agent's style system-prompt is prepended automatically, so don't restate the style.",
        },
        asker_address: {
          type: "string",
          description: "Optional: wallet address of the asker (0x…). Used for activity attribution.",
        },
      },
      required: ["agent_id", "prompt"],
    },
  },
  {
    name: "swarm_check_version",
    description:
      "Check whether your installed `swarm-marketplace-mcp` is up to date. Returns `{ current, latest, updateAvailable, command }`. If `updateAvailable: true`, run the returned `command` in your terminal to upgrade. Rate-exempt.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export const SWARM_MCP_VERSION = "0.10.0";
