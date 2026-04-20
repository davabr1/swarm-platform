import { db } from "@/lib/db";
import { callAgentStructured } from "@/lib/llm";
import { computeGeminiCost, formatUsd, parsePrice } from "@/lib/geminiPricing";
import { logActivity } from "@/lib/activity";
import { requireX402Payment } from "@/lib/x402Middleware";
import {
  fanoutSplit,
  recordX402Settlement,
  refundOverage,
} from "@/lib/postSettleFanout";
import {
  PLATFORM_FEE_CEILING_MULTIPLIER,
  PLATFORM_FEE_RATE,
} from "@/lib/platformFee";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export const maxDuration = 60;

const TURN_CAP = 5;
// Upfront ceiling used to build the 402 challenge. x402 requires a fixed
// amount in PaymentRequirements; we don't know actual Gemini token usage
// until after the model runs, so we charge commission + a modest Gemini
// ceiling + 1% margin. Actual cost is still recorded on the GuidanceRequest
// row; user may overpay by a few cents on short replies.
const PRICE_GEMINI_CEILING_USD = 0.05;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const agentId: string | undefined = body.agentId;
  const question: string | undefined = body.question;
  const conversationId: string | undefined =
    typeof body.conversationId === "string" && body.conversationId ? body.conversationId : undefined;

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

  const commission = agent.userCreated ? parsePrice(agent.price) : 0;
  const ceilingUsd =
    (commission + PRICE_GEMINI_CEILING_USD) * PLATFORM_FEE_CEILING_MULTIPLIER;
  const totalMicroUsd = BigInt(Math.ceil(ceilingUsd * 1_000_000));

  const gate = await requireX402Payment(req, {
    priceResolver: () => totalMicroUsd,
    description: `guidance · ${agent.name}`,
    resource: "/api/guidance",
  });
  if (gate.kind === "challenge") return gate.response;

  const askerAddress = gate.payer;

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

  let reply;
  try {
    reply = await callAgentStructured(systemPrompt, userText);
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

  let replyType: "question" | "response" = reply.type;
  if (isFinalTurn) replyType = "response";
  const usage = reply.usage;
  const text = reply.text;

  const geminiCost = computeGeminiCost({
    prompt: usage.promptTokens,
    output: usage.outputTokens,
    thoughts: usage.thoughtsTokens,
  });
  const platformFee = Math.round((commission + geminiCost) * PLATFORM_FEE_RATE * 10_000) / 10_000;
  const actualTotal = Math.round((commission + geminiCost + platformFee) * 10_000) / 10_000;

  const commissionUsd = formatUsd(commission);
  const geminiCostUsd = formatUsd(geminiCost);
  const platformFeeUsd = formatUsd(platformFee);
  const totalUsd = formatUsd(actualTotal);

  const commissionMicroUsd = agent.userCreated
    ? BigInt(Math.round(commission * 1_000_000))
    : BigInt(0);
  const creator = agent.creatorAddress ?? agent.walletAddress;

  let settled;
  try {
    settled = await gate.settle();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
        settlementStatus: "chain_error",
        errorMessage: message,
      },
    });
    return Response.json(
      {
        id,
        conversationId: rootId,
        status: "failed_settlement",
        error: "x402_settle_failed",
        message,
      },
      { status: 502 }
    );
  }

  const settleTxHash = settled.response.transaction ?? "";

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
      settlementTxHash: settleTxHash,
      settlementStatus: "confirmed",
    },
  });

  await db.agent.update({
    where: { id: agentId },
    data: { totalCalls: { increment: 1 } },
  });

  await recordX402Settlement({
    payer: askerAddress,
    totalMicroUsd,
    settlementTxHash: settleTxHash,
    refType: "guidance",
    refId: id,
    description: `guidance · ${agent.name}`,
  });

  const actualMicroUsd = BigInt(Math.round(actualTotal * 1_000_000));
  const refund = await refundOverage({
    payer: askerAddress,
    ceilingMicroUsd: totalMicroUsd,
    actualMicroUsd,
    settlementTxHash: settleTxHash,
    refType: "guidance",
    refId: id,
    description: `guidance · ${agent.name}`,
  });

  const fanout = agent.userCreated
    ? await fanoutSplit({
        creatorAddress: creator,
        commissionMicroUsd,
        settlementTxHash: settleTxHash,
        refType: "guidance",
        refId: id,
        description: `guidance · ${agent.name}`,
        payer: askerAddress,
      })
    : { ok: true as const, status: "skipped" as const };

  const kindLabel = replyType === "question" ? "clarify" : "guidance";
  const txTag = settleTxHash ? ` · x402 ${settleTxHash.slice(0, 10)}…` : "";
  await logActivity(
    "payment",
    `${kindLabel} · ${agent.name} · ${totalUsd} USDC — creator ${creator.slice(0, 8)}... gets ${commissionUsd} USDC, platform ${geminiCostUsd}+${platformFeeUsd} USDC${txTag}`,
  );

  return NextResponse.json(
    {
      id,
      conversationId: rootId,
      status: "ready",
      replyType,
      response: text,
      turn: turnNumber,
      capped: isFinalTurn,
      breakdown: { commissionUsd, geminiCostUsd, platformFeeUsd, totalUsd },
      settlement: {
        status: "confirmed",
        txHash: settleTxHash,
        network: settled.response.network,
        fanout:
          fanout.ok
            ? { status: fanout.status, txHash: fanout.status === "confirmed" ? fanout.txHash : undefined }
            : { status: "failed", message: fanout.message },
        refund:
          refund.ok
            ? { status: refund.status, txHash: refund.status === "confirmed" ? refund.txHash : undefined }
            : { status: "failed", message: refund.message },
      },
      tokens: {
        prompt: usage.promptTokens,
        output: usage.outputTokens,
        thoughts: usage.thoughtsTokens,
      },
      agent: { id: agent.id, name: agent.name, creatorAddress: creator },
      createdAt: updated.createdAt,
      readyAt: updated.readyAt,
    },
    {
      headers: {
        "X-PAYMENT-RESPONSE": settled.paymentResponseHeader,
      },
    },
  );
}
