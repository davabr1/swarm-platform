import { db } from "@/lib/db";
import { callAgentStructured } from "@/lib/llm";
import { computeGeminiCost, formatUsd, parsePrice } from "@/lib/geminiPricing";
import { logActivity } from "@/lib/activity";
import { resolveSession, incrementSpent } from "@/lib/session";
import { config } from "@/lib/config";
import { json402, paymentResponseHeader, settleCall } from "@/lib/x402";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

export const maxDuration = 60;

const TURN_CAP = 5;
// Pre-flight budget estimate: agent commission + Gemini ceiling + 5% cushion.
// Actual cost is known only after the LLM call; this gate blocks runaway loops
// when the on-chain allowance is still ahead of spendUsd. Mild over-spend is
// possible under concurrent calls — the on-chain allowance is the real cap.
const PREFLIGHT_GEMINI_CEILING_USD = 0.05;
const PREFLIGHT_OVERHEAD_RATIO = 1.05;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const agentId: string | undefined = body.agentId;
  const question: string | undefined = body.question;
  const conversationId: string | undefined =
    typeof body.conversationId === "string" && body.conversationId ? body.conversationId : undefined;

  // Paid routes require a session — either from an MCP Authorization:
  // Bearer header or from a browser-pair session. Anonymous callers are
  // rejected with 402 so the browser can open the pair modal; previously
  // we'd fall through to "mcp_client" and serve the LLM for free, which
  // meant activity-log "paid" entries on browser calls were lying.
  const resolution = await resolveSession(req);
  if (resolution.kind === "invalid_token") {
    return Response.json(
      { error: "invalid_session", reason: resolution.reason, message: "Session token invalid or revoked — re-pair." },
      { status: 401 },
    );
  }
  if (resolution.kind === "anonymous") {
    return json402({
      resource: "/api/guidance",
      microUsdc: BigInt(0),
      error: "authorization_required",
      description: "Connect a wallet and authorize a USDC budget to call this agent.",
    });
  }
  const session = resolution.session;
  const askerAddress: string = session.address;

  if (!agentId || !question) {
    return Response.json({ error: "Missing 'agentId' or 'question'" }, { status: 400 });
  }

  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
  if (agent.type === "human_expert") {
    return Response.json(
      { error: "Cannot ask human expert for guidance — post a task instead" },
      { status: 400 }
    );
  }
  if (agent.skill.startsWith("Image")) {
    return Response.json(
      {
        error:
          "This agent generates images, not text guidance — call /api/image (or swarm_generate_image via MCP) instead.",
      },
      { status: 400 }
    );
  }

  let priorTurns: Awaited<ReturnType<typeof db.guidanceRequest.findMany>> = [];
  let rootId: string;
  let parentId: string | null = null;

  if (conversationId) {
    const rootRow = await db.guidanceRequest.findUnique({ where: { id: conversationId } });
    if (!rootRow) {
      return Response.json({ error: "Unknown conversationId" }, { status: 404 });
    }
    if (rootRow.agentId !== agentId) {
      return Response.json({ error: "conversationId belongs to a different agent" }, { status: 400 });
    }
    rootId = rootRow.rootId ?? rootRow.id;
    priorTurns = await db.guidanceRequest.findMany({
      where: { rootId },
      orderBy: { createdAt: "asc" },
    });
    if (priorTurns.length === 0) {
      priorTurns = [rootRow];
    }
    if (priorTurns.length >= TURN_CAP) {
      return Response.json(
        { error: "conversation_cap_reached", turn: priorTurns.length, cap: TURN_CAP },
        { status: 400 }
      );
    }
    parentId = priorTurns[priorTurns.length - 1].id;
  } else {
    rootId = "";
  }

  if (session) {
    const commissionEstimate = agent.userCreated ? parsePrice(agent.price) : 0;
    const preflight =
      (commissionEstimate + PREFLIGHT_GEMINI_CEILING_USD) * PREFLIGHT_OVERHEAD_RATIO;
    if (session.spentUsd + preflight > session.budgetUsd) {
      return json402({
        resource: "/api/guidance",
        microUsdc: BigInt(Math.ceil(preflight * 1_000_000)),
        error: "budget_exhausted",
        description: "MCP session budget exhausted — re-pair to authorize a fresh USDC budget.",
        detail: { spentUsd: session.spentUsd, budgetUsd: session.budgetUsd },
      });
    }
  }

  const id = randomUUID();
  if (!conversationId) rootId = id;
  const turnNumber = priorTurns.length + 1;
  const isFinalTurn = turnNumber >= TURN_CAP;

  await db.guidanceRequest.create({
    data: {
      id,
      agentId,
      askerAddress,
      question,
      status: "pending",
      parentId,
      rootId,
    },
  });

  const userText = (() => {
    if (priorTurns.length === 0) return question;
    const history = priorTurns
      .map((t) => {
        const specialistTag = t.replyType === "question" ? "specialist (question)" : "specialist";
        const body = t.response ?? "";
        return `[asker]: ${t.question}\n[${specialistTag}]: ${body}`;
      })
      .join("\n\n");
    return `${history}\n\n[asker]: ${question}`;
  })();

  const capDirective = isFinalTurn
    ? '\n\nNOTE: This is the final exchange in the conversation. You MUST respond with type "response", not "question".'
    : "";
  const systemPrompt = `${agent.systemPrompt ?? ""}${capDirective}`;

  try {
    const reply = await callAgentStructured(systemPrompt, userText);
    let replyType: "question" | "response" = reply.type;
    if (isFinalTurn) replyType = "response";
    const usage = reply.usage;
    const text = reply.text;

    const geminiCost = computeGeminiCost({
      prompt: usage.promptTokens,
      output: usage.outputTokens,
      thoughts: usage.thoughtsTokens,
    });
    // Platform-owned agents don't charge commission — the platform keeps
    // the 5% margin on every call and taking another cut on top would be
    // double-dipping. Only user-created agents (userCreated=true) pass their
    // `price` through as commission to their creator.
    const commission = agent.userCreated ? parsePrice(agent.price) : 0;
    const platformFee = Math.round((commission + geminiCost) * 0.05 * 10_000) / 10_000;
    const total = Math.round((commission + geminiCost + platformFee) * 10_000) / 10_000;

    const commissionUsd = formatUsd(commission);
    const geminiCostUsd = formatUsd(geminiCost);
    const platformFeeUsd = formatUsd(platformFee);
    const totalUsd = formatUsd(total);

    // Settle on-chain BEFORE persisting status="ready" so a settlement
    // failure doesn't leave the row claiming success. Browser UI callers
    // (no session) skip settlement entirely — the marketplace UI is
    // demo-only and doesn't hit the payer's wallet.
    let settlement: Awaited<ReturnType<typeof settleCall>> | null = null;
    if (session) {
      const microUsdc = BigInt(Math.round(total * 1_000_000));
      settlement = await settleCall({
        payer: session.address,
        payTo: config.orchestrator.address,
        microUsdc,
        description: `guidance · ${agent.name}`,
      });
    }

    // Payer-side failure (insufficient allowance / balance): persist
    // breakdown so the row explains *why* it failed, but NOT spentUsd —
    // otherwise a stuck DB counter would persistently 402 the user. Return
    // 402 with a structured payment-required body.
    if (settlement && !settlement.ok && settlement.payerError) {
      await db.guidanceRequest.update({
        where: { id },
        data: {
          status: "failed_settlement",
          response: text,
          replyType,
          commissionUsd,
          geminiCostUsd,
          platformFeeUsd,
          totalUsd,
          promptTokens: usage.promptTokens,
          outputTokens: usage.outputTokens,
          thoughtsTokens: usage.thoughtsTokens,
          settlementStatus: settlement.kind,
          errorMessage: settlement.message,
        },
      });
      return json402({
        resource: "/api/guidance",
        microUsdc: BigInt(Math.round(total * 1_000_000)),
        error: settlement.kind,
        description:
          settlement.kind === "allowance_exhausted"
            ? "Your USDC allowance to the orchestrator is exhausted. Re-pair to approve a fresh budget."
            : "Insufficient USDC in your wallet. Top up and retry.",
      });
    }

    // Server-side failure (RPC down, orchestrator out of gas): same row
    // treatment but 502 so the client retries later.
    if (settlement && !settlement.ok && !settlement.payerError) {
      await db.guidanceRequest.update({
        where: { id },
        data: {
          status: "failed_settlement",
          response: text,
          replyType,
          commissionUsd,
          geminiCostUsd,
          platformFeeUsd,
          totalUsd,
          settlementStatus: settlement.kind,
          errorMessage: settlement.message,
        },
      });
      return Response.json(
        { id, conversationId: rootId, status: "failed_settlement", error: settlement.message },
        { status: 502 },
      );
    }

    const updated = await db.guidanceRequest.update({
      where: { id },
      data: {
        status: "ready",
        response: text,
        replyType,
        readyAt: new Date(),
        commissionUsd,
        geminiCostUsd,
        platformFeeUsd,
        totalUsd,
        promptTokens: usage.promptTokens,
        outputTokens: usage.outputTokens,
        thoughtsTokens: usage.thoughtsTokens,
        settlementTxHash: settlement?.ok ? settlement.txHash : null,
        settlementStatus: settlement?.ok ? settlement.status : "skipped",
      },
    });

    await db.agent.update({
      where: { id: agentId },
      data: { totalCalls: { increment: 1 } },
    });

    if (session) {
      // Post-flight increment with the actual totalUsd. The DB counter
      // stays ahead of any pre-flight estimate so subsequent calls 402
      // once real spend (including this one) catches the budget.
      await incrementSpent(session.id, total);
    }

    const creator = agent.creatorAddress ?? agent.walletAddress;
    const kindLabel = replyType === "question" ? "clarify" : "guidance";
    const txTag = settlement?.ok && settlement.status === "confirmed"
      ? ` · tx ${settlement.txHash.slice(0, 10)}…`
      : "";
    await logActivity(
      "payment",
      `${kindLabel} · ${agent.name} · ${totalUsd} USDC — creator ${creator.slice(0, 8)}... gets ${commissionUsd} USDC, platform ${geminiCostUsd}+${platformFeeUsd} USDC${txTag}`
    );

    const headers: Record<string, string> = {};
    if (settlement?.ok) {
      headers["X-PAYMENT-RESPONSE"] = paymentResponseHeader(settlement);
    }

    return Response.json(
      {
        id,
        conversationId: rootId,
        status: "ready",
        replyType,
        response: text,
        turn: turnNumber,
        capped: isFinalTurn,
        breakdown: {
          commissionUsd,
          geminiCostUsd,
          platformFeeUsd,
          totalUsd,
        },
        settlement: settlement?.ok
          ? { status: settlement.status, txHash: settlement.txHash, blockNumber: settlement.blockNumber }
          : undefined,
        tokens: {
          prompt: usage.promptTokens,
          output: usage.outputTokens,
          thoughts: usage.thoughtsTokens,
        },
        agent: {
          id: agent.id,
          name: agent.name,
          creatorAddress: creator,
        },
        createdAt: updated.createdAt,
        readyAt: updated.readyAt,
      },
      { headers },
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    await db.guidanceRequest.update({
      where: { id },
      data: { status: "failed", errorMessage },
    });
    return Response.json(
      { id, conversationId: rootId, status: "failed", error: errorMessage },
      { status: 502 }
    );
  }
}
