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
import { getSessionFromRequest, incrementSpent } from "@/lib/session";
import { json402, paymentResponseHeader, settleCall } from "@/lib/x402";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

// Pre-flight budget estimate for image calls: commission + a higher Gemini
// ceiling than guidance (images run ~$0.04–$0.14) + 5% cushion.
const PREFLIGHT_IMAGE_CEILING_USD = 0.2;
const PREFLIGHT_OVERHEAD_RATIO = 1.05;

export const runtime = "nodejs";
// Flash typically returns in 3-10s, but cold starts, region latency, and the
// occasional retry-on-text-fallback can push a call past Vercel's default
// 10s budget. 60s gives us headroom without silently 504'ing mid-gen.
export const maxDuration = 60;

// Map built-in image agent ids → Gemini model. Keeps the route thin.
const AGENT_MODELS: Record<string, string> = Object.fromEntries(
  Object.values(config.imageAgents).map((a) => [a.id, a.model]),
);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const agentId: string | undefined = body.agentId;
  const prompt: string | undefined = body.prompt;

  // MCP callers carry Authorization: Bearer — derive the payer wallet from
  // the session. Browser UI callers (no session) still work but skip
  // on-chain settlement (marketplace demo, no funded wallet).
  const session = await getSessionFromRequest(req);
  const askerAddress: string = session
    ? session.address
    : typeof body.askerAddress === "string" && body.askerAddress
      ? body.askerAddress
      : "mcp_client";

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

  if (session) {
    const commissionEstimate = agent.userCreated ? parsePrice(agent.price) : 0;
    const preflight =
      (commissionEstimate + PREFLIGHT_IMAGE_CEILING_USD) * PREFLIGHT_OVERHEAD_RATIO;
    if (session.spentUsd + preflight > session.budgetUsd) {
      return json402({
        resource: "/api/image",
        microUsdc: BigInt(Math.ceil(preflight * 1_000_000)),
        error: "budget_exhausted",
        description: "MCP session budget exhausted — re-pair to authorize a fresh USDC budget.",
        detail: { spentUsd: session.spentUsd, budgetUsd: session.budgetUsd },
      });
    }
  }

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

  try {
    const result = await generateImage(agent.systemPrompt ?? "", prompt, model);

    const buffer = Buffer.from(result.base64, "base64");
    // Serverless filesystems (Vercel, Lambda) are read-only — `/var/task`
    // rejects mkdir. Instead of writing to `public/generated/` we stash the
    // base64 in Postgres and serve it via GET /api/image/[id]. Same URL shape
    // from the caller's perspective, and it survives cold starts + deploys.
    const url = `${req.nextUrl.origin}/api/image/${id}`;

    const imageCost = computeImageCost(model);
    const tokenCost = computeGeminiCost({
      prompt: result.usage.promptTokens,
      output: 0,
      thoughts: result.usage.thoughtsTokens,
    });
    const geminiCost = Math.round((imageCost + tokenCost) * 10_000) / 10_000;
    // Platform-owned agents don't charge commission (platform keeps the
    // 5% margin — no double-dipping). Only user-created agents pass their
    // posted price through as commission to their creator.
    const commission = agent.userCreated ? parsePrice(agent.price) : 0;
    const platformFee = Math.round((commission + geminiCost) * 0.05 * 10_000) / 10_000;
    const total = Math.round((commission + geminiCost + platformFee) * 10_000) / 10_000;

    const commissionUsd = formatUsd(commission);
    const geminiCostUsd = formatUsd(geminiCost);
    const platformFeeUsd = formatUsd(platformFee);
    const totalUsd = formatUsd(total);

    // Settle on-chain before persisting status="ready" (same pattern as
    // /api/guidance). Browser UI callers skip settlement.
    let settlement: Awaited<ReturnType<typeof settleCall>> | null = null;
    if (session) {
      const microUsdc = BigInt(Math.round(total * 1_000_000));
      settlement = await settleCall({
        payer: session.address,
        payTo: config.orchestrator.address,
        microUsdc,
        description: `image · ${agent.name}`,
      });
    }

    const creator = agent.creatorAddress ?? agent.walletAddress;

    if (settlement && !settlement.ok && settlement.payerError) {
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
          settlementStatus: settlement.kind,
          errorMessage: settlement.message,
        },
      });
      return json402({
        resource: "/api/image",
        microUsdc: BigInt(Math.round(total * 1_000_000)),
        error: settlement.kind,
        description:
          settlement.kind === "allowance_exhausted"
            ? "Your USDC allowance to the orchestrator is exhausted. Re-pair to approve a fresh budget."
            : "Insufficient USDC in your wallet. Top up and retry.",
      });
    }
    if (settlement && !settlement.ok && !settlement.payerError) {
      await db.imageGeneration.update({
        where: { id },
        data: {
          status: "failed_settlement",
          settlementStatus: settlement.kind,
          errorMessage: settlement.message,
        },
      });
      return Response.json(
        { id, status: "failed_settlement", error: settlement.message },
        { status: 502 },
      );
    }

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
          settlementTxHash: settlement?.ok ? settlement.txHash : null,
          settlementStatus: settlement?.ok ? settlement.status : "skipped",
        },
      }),
      db.agent.update({
        where: { id: agentId },
        data: { totalCalls: { increment: 1 } },
      }),
      logActivity(
        "payment",
        `image · ${agent.name} · ${totalUsd} USDC — creator ${creator.slice(0, 8)}... gets ${commissionUsd} USDC, gemini ${geminiCostUsd} USDC${settlement?.ok && settlement.status === "confirmed" ? ` · tx ${settlement.txHash.slice(0, 10)}…` : ""}`,
      ),
    ]);

    if (session) {
      await incrementSpent(session.id, total);
    }

    const headers: Record<string, string> = {};
    if (settlement?.ok) {
      headers["X-PAYMENT-RESPONSE"] = paymentResponseHeader(settlement);
    }

    return Response.json(
      {
        id,
        status: "ready",
        imageUrl: url,
        // Raw base64 for MCP clients that want to return an inline image
        // content-block to the calling LLM instead of just a URL. Keeps
        // Claude / Codex from needing a second fetch to actually "see" it.
        imageBase64: result.base64,
        mimeType: result.mimeType,
        sizeBytes: buffer.length,
        model,
        breakdown: { commissionUsd, geminiCostUsd, platformFeeUsd, totalUsd },
        settlement: settlement?.ok
          ? { status: settlement.status, txHash: settlement.txHash, blockNumber: settlement.blockNumber }
          : undefined,
        tokens: {
          prompt: result.usage.promptTokens,
          output: result.usage.outputTokens,
          thoughts: result.usage.thoughtsTokens,
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
    await db.imageGeneration.update({
      where: { id },
      data: { status: "failed", errorMessage },
    });
    return Response.json({ id, status: "failed", error: errorMessage }, { status: 502 });
  }
}
