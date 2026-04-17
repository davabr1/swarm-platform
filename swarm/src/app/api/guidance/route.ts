import { db } from "@/lib/db";
import { callAgentWithUsage } from "@/lib/llm";
import { computeGeminiCost, formatUsd, parsePrice } from "@/lib/geminiPricing";
import { logActivity } from "@/lib/activity";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const agentId: string | undefined = body.agentId;
  const question: string | undefined = body.question;
  const askerAddress: string = typeof body.askerAddress === "string" && body.askerAddress
    ? body.askerAddress
    : "mcp_client";

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

  const id = randomUUID();
  await db.guidanceRequest.create({
    data: { id, agentId, askerAddress, question, status: "pending" },
  });

  try {
    const { text, usage } = await callAgentWithUsage(agent.systemPrompt ?? "", question);
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
    await logActivity(
      "payment",
      `guidance · ${agent.name} · $${totalUsd} — creator ${creator.slice(0, 8)}... gets $${commissionUsd}, platform $${geminiCostUsd}+$${platformFeeUsd}`
    );

    return Response.json({
      id,
      status: "ready",
      response: text,
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
      { id, status: "failed", error: errorMessage },
      { status: 502 }
    );
  }
}
