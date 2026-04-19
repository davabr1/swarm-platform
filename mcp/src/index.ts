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
import {
  getOrCreateKey,
  signRateMessage,
  swarmApiUrl,
  swarmFetch,
  usdcBalance,
} from "./session.js";

const SWARM_API = swarmApiUrl();

interface MarketplaceAgent {
  id: string;
  name: string;
  skill: string;
  price: string;
  estCostPerCallUsd?: string;
  address: string;
  type: "ai" | "custom_skill" | "human_expert";
  reputation: { count: number; averageScore: number };
  totalCalls: number;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
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
        return textResponse(JSON.stringify(data, null, 2) + hint);
      }

      case "swarm_rate_agent": {
        const agentId = String(toolArgs.agent_id);
        const score = Number(toolArgs.score);
        const signature = await signRateMessage(`rate-agent:${agentId}:${score}`);
        const res = await swarmFetch(`/api/agents/${agentId}/rate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Rate-Signature": signature,
          },
          body: JSON.stringify({ score }),
        });
        const data = await res.json();
        return textResponse(JSON.stringify(data, null, 2));
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
        return textResponse(JSON.stringify(data, null, 2) + reminder);
      }

      case "swarm_get_human_task": {
        const taskId = String(toolArgs.task_id);
        const res = await swarmFetch(`/api/tasks/${taskId}`);
        const data = (await res.json()) as Record<string, unknown>;
        let hint = "";
        // Optional photo/PDF attachment comes back as a data URI. Images get
        // surfaced as an inline image content block so the calling LLM can
        // actually see them; PDFs can't be inlined (MCP lacks a pdf content
        // type), so we keep the data URI in the JSON and tell the agent it's
        // a PDF. In both cases the big blob replaces itself with a short
        // marker in the text JSON so the response stays readable.
        const attachment =
          typeof data.resultAttachment === "string" ? data.resultAttachment : null;
        const attachmentType =
          typeof data.resultAttachmentType === "string" ? data.resultAttachmentType : null;
        const textData = { ...data };
        if (attachment) {
          textData.resultAttachment =
            attachmentType?.startsWith("image/")
              ? "<image attached inline below>"
              : `<${attachmentType ?? "attachment"} · data URI preserved below>`;
        }
        if (data && typeof data === "object") {
          const status = (data as { status?: string }).status;
          const posterRating = (data as { posterRating?: number | null }).posterRating;
          if (status === "completed" && (posterRating == null || posterRating === 0)) {
            hint =
              `\n\nThis task is complete and unrated. Rate the claimer honestly: ` +
              `\`swarm_rate_human_task(task_id="${taskId}", score=1-5)\`. ` +
              `Score what they delivered against the brief — met the spec = 5, partial = 3-4, ignored = 1-2. ` +
              `No inflation, no deflation. The MCP signs and submits for you.`;
          }
        }
        const content: Array<
          | { type: "text"; text: string }
          | { type: "image"; data: string; mimeType: string }
        > = [{ type: "text", text: JSON.stringify(textData, null, 2) + hint }];
        if (attachment && attachmentType?.startsWith("image/")) {
          const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(attachment);
          if (m) {
            content.push({ type: "image", mimeType: m[1], data: m[2] });
          }
        } else if (attachment && attachmentType === "application/pdf") {
          // Return the PDF data URI verbatim so the agent can pass it to a
          // tool that parses PDFs (many clients have one) or save it to disk.
          content.push({
            type: "text",
            text: `\n📎 pdf attachment (data URI):\n${attachment}`,
          });
        }
        return { content };
      }

      case "swarm_rate_human_task": {
        const taskId = String(toolArgs.task_id);
        const score = Number(toolArgs.score);
        const signature = await signRateMessage(`rate-task:${taskId}:${score}`);
        const res = await swarmFetch(`/api/tasks/${taskId}/rate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Rate-Signature": signature,
          },
          body: JSON.stringify({ score }),
        });
        const data = await res.json();
        return textResponse(JSON.stringify(data, null, 2));
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
        const payload = data as {
          imageUrl?: string;
          viewerUrl?: string;
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
          ? `\n\n✓ Image ready. ` +
            (payload.viewerUrl
              ? `**Paste this viewer link to the user now, in chat, on its own line — even if this image is one step in a larger task:** ${payload.viewerUrl}\n` +
                `The inline preview below isn't persisted on the user's side, so the viewer link is their only way to save, share, or come back to the image. Don't silently drop it because the workflow isn't finished. `
              : "") +
            (payload.imageUrl ? `Raw PNG (no landing page): ${payload.imageUrl}. ` : "") +
            `After you've shown it to the user, rate it honestly: ` +
            `\`swarm_rate_agent(agent_id="${agentId}", score=1-5)\`. ` +
            `Score the output against the prompt — matched intent = 5, usable but off = 3-4, missed = 1-2. ` +
            `No bias either way. The MCP signs and submits for you.`
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

      case "swarm_wallet_balance": {
        const key = await getOrCreateKey();
        const bal = await usdcBalance(key.address);
        if (bal === null) {
          return textResponse(
            JSON.stringify(
              {
                address: key.address,
                network: "eip155:43113 (Avalanche Fuji)",
                error: "rpc_unavailable",
              },
              null,
              2,
            ),
          );
        }
        const usdc = (Number(bal) / 1_000_000).toFixed(6);
        return textResponse(
          JSON.stringify(
            {
              address: key.address,
              network: "eip155:43113 (Avalanche Fuji)",
              usdc,
              usdcMicro: bal.toString(),
            },
            null,
            2,
          ),
        );
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
      (payload.turn != null ? `\n\nturn ${payload.turn} of 5.` : "")
    );
  }

  if (replyType === "response") {
    const cappedNote = payload.capped ? ` (forced final — 5-turn cap reached)` : "";
    return (
      `${body}\n\n` +
      `✓ Final answer${cappedNote} — surface it to the user now, then rate.\n\n` +
      `After the user has the answer, rate this call honestly: ` +
      `\`swarm_rate_agent(agent_id="${agentId}", score=1-5)\`. ` +
      `Score what the specialist actually delivered vs. what you asked — no positivity bias, no harshness. ` +
      `If the answer nailed it, that's a 5. If it was useful but partial, a 3-4. If it missed, a 1-2. ` +
      `The MCP signs and submits for you; the on-chain reputation is only as useful as the scores are accurate.`
    );
  }

  // status !== "ready" (rare — route returns synchronously)
  return (
    `${body}\n\n⟶ No replyType present. If status !== "ready", poll \`swarm_get_guidance\` with request_id="${payload.id ?? "<id>"}" every ~10 seconds.`
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
