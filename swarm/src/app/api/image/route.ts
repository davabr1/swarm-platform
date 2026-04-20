import { db } from "@/lib/db";
import { generateImage } from "@/lib/llm";
import {
  computeGeminiCost,
  computeImageCost,
  formatUsd,
  parsePrice,
} from "@/lib/geminiPricing";
import { logActivity } from "@/lib/activity";
import { config } from "@/lib/config";
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

// Upfront ceiling for the x402 challenge. Actual Gemini image cost depends
// on model + thoughts tokens, which we don't know until after the render.
// Ceiling = commission + image ceiling + 1% margin. Short renders slightly
// overcharge; the DB row records actual cost.
const PRICE_IMAGE_CEILING_USD = 0.2;

export const runtime = "nodejs";
export const maxDuration = 60;

const AGENT_MODELS: Record<string, string> = Object.fromEntries(
  Object.values(config.imageAgents).map((a) => [a.id, a.model]),
);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const agentId: string | undefined = body.agentId;
  const prompt: string | undefined = body.prompt;

  if (!agentId || !prompt) {
    return Response.json({ error: "Missing 'agentId' or 'prompt'" }, { status: 400 });
  }

  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
  if (!agent.skill.startsWith("Image")) {
    return Response.json(
      { error: "Agent does not generate images — use swarm_ask_agent instead" },
      { status: 400 },
    );
  }

  const commission = agent.userCreated ? parsePrice(agent.price) : 0;
  const ceilingUsd =
    (commission + PRICE_IMAGE_CEILING_USD) * PLATFORM_FEE_CEILING_MULTIPLIER;
  const totalMicroUsd = BigInt(Math.ceil(ceilingUsd * 1_000_000));

  const gate = await requireX402Payment(req, {
    priceResolver: () => totalMicroUsd,
    description: `image · ${agent.name}`,
    resource: "/api/image",
  });
  if (gate.kind === "challenge") return gate.response;

  const askerAddress = gate.payer;
  const model = AGENT_MODELS[agentId] ?? agent.pricingModel ?? "gemini-3.1-flash-image-preview";
  const id = randomUUID();

  await db.imageGeneration.create({
    data: {
      id,
      agentId,
      askerAddress,
      prompt,
      status: "pending",
      model,
    },
  });

  let result;
  try {
    result = await generateImage(agent.systemPrompt ?? "", prompt, model);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    await db.imageGeneration.update({
      where: { id },
      data: { status: "failed", errorMessage },
    });
    return Response.json({ id, status: "failed", error: errorMessage }, { status: 502 });
  }

  const buffer = Buffer.from(result.base64, "base64");
  const url = `${req.nextUrl.origin}/api/image/${id}`;
  const viewerUrl = `${req.nextUrl.origin}/image/${id}`;

  const imageCost = computeImageCost(model);
  const tokenCost = computeGeminiCost({
    prompt: result.usage.promptTokens,
    output: 0,
    thoughts: result.usage.thoughtsTokens,
  });
  const geminiCost = Math.round((imageCost + tokenCost) * 10_000) / 10_000;
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
    await db.imageGeneration.update({
      where: { id },
      data: {
        status: "failed_settlement",
        imageBase64: result.base64,
        mimeType: result.mimeType,
        sizeBytes: buffer.length,
        commissionUsd,
        geminiCostUsd,
        platformFeeUsd,
        totalUsd,
        promptTokens: result.usage.promptTokens,
        outputTokens: result.usage.outputTokens,
        thoughtsTokens: result.usage.thoughtsTokens,
        settlementStatus: "chain_error",
        errorMessage: message,
      },
    });
    return Response.json(
      { id, status: "failed_settlement", error: "x402_settle_failed", message },
      { status: 502 },
    );
  }

  const settleTxHash = settled.response.transaction ?? "";

  const [updated] = await Promise.all([
    db.imageGeneration.update({
      where: { id },
      data: {
        status: "ready",
        imageUrl: url,
        imageBase64: result.base64,
        mimeType: result.mimeType,
        sizeBytes: buffer.length,
        readyAt: new Date(),
        commissionUsd,
        geminiCostUsd,
        platformFeeUsd,
        totalUsd,
        promptTokens: result.usage.promptTokens,
        outputTokens: result.usage.outputTokens,
        thoughtsTokens: result.usage.thoughtsTokens,
        settlementTxHash: settleTxHash,
        settlementStatus: "confirmed",
      },
    }),
    db.agent.update({
      where: { id: agentId },
      data: { totalCalls: { increment: 1 } },
    }),
  ]);

  await recordX402Settlement({
    payer: askerAddress,
    totalMicroUsd,
    settlementTxHash: settleTxHash,
    refType: "image",
    refId: id,
    description: `image · ${agent.name}`,
  });

  const actualMicroUsd = BigInt(Math.round(actualTotal * 1_000_000));
  const refund = await refundOverage({
    payer: askerAddress,
    ceilingMicroUsd: totalMicroUsd,
    actualMicroUsd,
    settlementTxHash: settleTxHash,
    refType: "image",
    refId: id,
    description: `image · ${agent.name}`,
  });

  const fanout = agent.userCreated
    ? await fanoutSplit({
        creatorAddress: creator,
        commissionMicroUsd,
        settlementTxHash: settleTxHash,
        refType: "image",
        refId: id,
        description: `image · ${agent.name}`,
        payer: askerAddress,
      })
    : { ok: true as const, status: "skipped" as const };

  await logActivity(
    "payment",
    `image · ${agent.name} · ${totalUsd} USDC — creator ${creator.slice(0, 8)}... gets ${commissionUsd} USDC, gemini ${geminiCostUsd} USDC · x402 ${settleTxHash.slice(0, 10)}…`,
  );

  return NextResponse.json(
    {
      id,
      status: "ready",
      imageUrl: url,
      viewerUrl,
      imageBase64: result.base64,
      mimeType: result.mimeType,
      sizeBytes: buffer.length,
      model,
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
        prompt: result.usage.promptTokens,
        output: result.usage.outputTokens,
        thoughts: result.usage.thoughtsTokens,
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
