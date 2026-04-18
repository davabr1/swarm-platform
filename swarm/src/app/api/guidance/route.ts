import { db } from "@/lib/db";
import { callAgentStructured } from "@/lib/llm";
import { computeGeminiCost, formatUsd, parsePrice } from "@/lib/geminiPricing";
import { logActivity } from "@/lib/activity";
import { resolveSession } from "@/lib/session";
import { readManualSession } from "@/lib/manualSession";
import { config } from "@/lib/config";
import { settleFromBalance } from "@/lib/ledger";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

export const maxDuration = 60;

const TURN_CAP = 5;
// Pre-flight cap estimate: commission + Gemini ceiling + 5% cushion. Only
// used on the autonomous path to short-circuit runaway loops before we
// call the LLM. The authoritative cap enforcement lives in settleFromBalance.
const PREFLIGHT_GEMINI_CEILING_USD = 0.05;
const PREFLIGHT_OVERHEAD_RATIO = 1.05;

type Payer =
  | { kind: "autonomous"; address: string; sessionId: string }
  | { kind: "manual"; address: string };

async function resolvePayer(req: NextRequest): Promise<Payer | Response> {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (header && header.toLowerCase().startsWith("bearer ")) {
    const r = await resolveSession(req);
    if (r.kind === "invalid_token") {
      return Response.json(
        { error: "invalid_session", reason: r.reason, message: "Session token invalid or revoked — re-pair." },
        { status: 401 },
      );
    }
    if (r.kind === "session") {
      return { kind: "autonomous", address: r.session.address.toLowerCase(), sessionId: r.session.id };
    }
  }

  const manual = await readManualSession();
  if (manual) return { kind: "manual", address: manual.address.toLowerCase() };

  return Response.json(
    {
      error: "authorization_required",
      message: "Sign in with your wallet to call this agent.",
      hint: "POST /api/manual-session with a signed handshake, or pair an MCP client.",
    },
    { status: 401 },
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const agentId: string | undefined = body.agentId;
  const question: string | undefined = body.question;
  const conversationId: string | undefined =
    typeof body.conversationId === "string" && body.conversationId ? body.conversationId : undefined;

  const payer = await resolvePayer(req);
  if (payer instanceof Response) return payer;
  const askerAddress = payer.address;

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

  // Cheap preflight on the autonomous path: fail fast on clearly-exhausted
  // caps before we pay Gemini. settleFromBalance is authoritative.
  if (payer.kind === "autonomous") {
    const commissionEstimate = agent.userCreated ? parsePrice(agent.price) : 0;
    const preflightMicro = BigInt(
      Math.ceil(
        (commissionEstimate + PREFLIGHT_GEMINI_CEILING_USD) *
          PREFLIGHT_OVERHEAD_RATIO *
          1_000_000,
      ),
    );
    const profile = await db.userProfile.findUnique({
      where: { walletAddress: askerAddress },
    });
    const capStored = profile?.autonomousCapUsd;
    const capMicro =
      capStored && Number(capStored) >= 0
        ? BigInt(Math.round(Number(capStored) * 1_000_000))
        : null;
    const spent = profile?.autonomousSpentMicroUsd ?? BigInt(0);
    if (capMicro !== null && spent + preflightMicro > capMicro) {
      return Response.json(
        {
          error: "autonomous_cap_exhausted",
          message: "Autonomous allowance exhausted — raise it or reset usage on /profile.",
          spentMicroUsd: spent.toString(),
          capMicroUsd: capMicro.toString(),
        },
        { status: 402 },
      );
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
    // Platform-owned agents don't charge commission. Only user-created
    // agents pass their `price` through to their creator.
    const commission = agent.userCreated ? parsePrice(agent.price) : 0;
    const platformFee = Math.round((commission + geminiCost) * 0.05 * 10_000) / 10_000;
    const total = Math.round((commission + geminiCost + platformFee) * 10_000) / 10_000;

    const commissionUsd = formatUsd(commission);
    const geminiCostUsd = formatUsd(geminiCost);
    const platformFeeUsd = formatUsd(platformFee);
    const totalUsd = formatUsd(total);

    const totalMicroUsd = BigInt(Math.round(total * 1_000_000));
    const commissionMicroUsd = agent.userCreated
      ? BigInt(Math.round(commission * 1_000_000))
      : BigInt(0);

    const creator = agent.creatorAddress ?? agent.walletAddress;
    // Primary transfer: `total - commission` (gemini cost + platform fee)
    // to the platform-agent wallet. If the agent is user-created, a second
    // transfer inside settleFromBalance routes `commission` to the creator.
    const settlement = await settleFromBalance({
      payerAddress: askerAddress,
      recipientAddress: config.platformAgentAddress,
      totalMicroUsd,
      commissionMicroUsd: agent.userCreated ? commissionMicroUsd : BigInt(0),
      commissionAddress: agent.userCreated ? creator : null,
      isAutonomous: payer.kind === "autonomous",
      refType: "guidance",
      refId: id,
      description: `guidance · ${agent.name}`,
    });

    if (!settlement.ok) {
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
      const status =
        settlement.kind === "chain_error" ? 502 : 402;
      return Response.json(
        {
          id,
          conversationId: rootId,
          status: "failed_settlement",
          error: settlement.kind,
          message: settlement.message,
        },
        { status },
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
        settlementTxHash: settlement.txHash,
        settlementStatus: settlement.status,
      },
    });

    await db.agent.update({
      where: { id: agentId },
      data: { totalCalls: { increment: 1 } },
    });

    const kindLabel = replyType === "question" ? "clarify" : "guidance";
    const txTag =
      settlement.status === "confirmed" ? ` · tx ${settlement.txHash.slice(0, 10)}…` : "";
    await logActivity(
      "payment",
      `${kindLabel} · ${agent.name} · ${totalUsd} USDC — creator ${creator.slice(0, 8)}... gets ${commissionUsd} USDC, platform ${geminiCostUsd}+${platformFeeUsd} USDC${txTag}`,
    );

    return Response.json({
      id,
      conversationId: rootId,
      status: "ready",
      replyType,
      response: text,
      turn: turnNumber,
      capped: isFinalTurn,
      breakdown: { commissionUsd, geminiCostUsd, platformFeeUsd, totalUsd },
      settlement: {
        status: settlement.status,
        txHash: settlement.txHash,
        blockNumber: settlement.blockNumber,
      },
      tokens: {
        prompt: usage.promptTokens,
        output: usage.outputTokens,
        thoughts: usage.thoughtsTokens,
      },
      agent: { id: agent.id, name: agent.name, creatorAddress: creator },
      createdAt: updated.createdAt,
      readyAt: updated.readyAt,
    });
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
