import { db } from "@/lib/db";
import { callAgentStructured } from "@/lib/llm";
import { computeGeminiCost, formatUsd, parsePrice } from "@/lib/geminiPricing";
import { logActivity } from "@/lib/activity";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

const TURN_CAP = 5;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const agentId: string | undefined = body.agentId;
  const question: string | undefined = body.question;
  const askerAddress: string = typeof body.askerAddress === "string" && body.askerAddress
    ? body.askerAddress
    : "mcp_client";
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
    const commission = parsePrice(agent.price);
    const platformFee = Math.round((commission + geminiCost) * 0.05 * 10_000) / 10_000;
    const total = Math.round((commission + geminiCost + platformFee) * 10_000) / 10_000;

    const commissionUsd = formatUsd(commission);
    const geminiCostUsd = formatUsd(geminiCost);
    const platformFeeUsd = formatUsd(platformFee);
    const totalUsd = formatUsd(total);

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
      },
    });

    await db.agent.update({
      where: { id: agentId },
      data: { totalCalls: { increment: 1 } },
    });

    const creator = agent.creatorAddress ?? agent.walletAddress;
    const kindLabel = replyType === "question" ? "clarify" : "guidance";
    await logActivity(
      "payment",
      `${kindLabel} · ${agent.name} · $${totalUsd} — creator ${creator.slice(0, 8)}... gets $${commissionUsd}, platform $${geminiCostUsd}+$${platformFeeUsd}`
    );

    return Response.json({
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
