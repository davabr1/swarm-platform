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
import { resolveSession } from "@/lib/session";
import { readManualSession } from "@/lib/manualSession";
import { settleFromBalance } from "@/lib/ledger";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

// Pre-flight cap estimate for image calls: commission + Gemini ceiling + 5%.
// Only gates the autonomous path. settleFromBalance is authoritative.
const PREFLIGHT_IMAGE_CEILING_USD = 0.2;
const PREFLIGHT_OVERHEAD_RATIO = 1.05;

export const runtime = "nodejs";
// Flash typically returns in 3-10s, but cold starts, region latency, and the
// occasional retry-on-text-fallback can push a call past Vercel's default
// 10s budget. 60s gives us headroom without silently 504'ing mid-gen.
export const maxDuration = 60;

const AGENT_MODELS: Record<string, string> = Object.fromEntries(
  Object.values(config.imageAgents).map((a) => [a.id, a.model]),
);

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
  const prompt: string | undefined = body.prompt;

  const payer = await resolvePayer(req);
  if (payer instanceof Response) return payer;
  const askerAddress = payer.address;

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

  if (payer.kind === "autonomous") {
    const commissionEstimate = agent.userCreated ? parsePrice(agent.price) : 0;
    const preflightMicro = BigInt(
      Math.ceil(
        (commissionEstimate + PREFLIGHT_IMAGE_CEILING_USD) *
          PREFLIGHT_OVERHEAD_RATIO *
          1_000_000,
      ),
    );
    const profile = await db.userProfile.findUnique({
      where: { walletAddress: askerAddress },
    });
    const capStored = profile?.autonomousCapUsd;
    const capMicro = capStored
      ? BigInt(Math.round(Number(capStored) * 1_000_000))
      : config.defaultAutonomousCapMicroUsd;
    const spent = profile?.autonomousSpentMicroUsd ?? BigInt(0);
    if (spent + preflightMicro > capMicro) {
      return Response.json(
        {
          error: "autonomous_cap_exhausted",
          message: "Global autonomous cap exceeded — raise the cap or reset usage.",
          spentMicroUsd: spent.toString(),
          capMicroUsd: capMicro.toString(),
        },
        { status: 402 },
      );
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

    const settlement = await settleFromBalance({
      payerAddress: askerAddress,
      recipientAddress: config.platformAgentAddress,
      totalMicroUsd,
      commissionMicroUsd: agent.userCreated ? commissionMicroUsd : BigInt(0),
      commissionAddress: agent.userCreated ? creator : null,
      isAutonomous: payer.kind === "autonomous",
      refType: "image",
      refId: id,
      description: `image · ${agent.name}`,
    });

    if (!settlement.ok) {
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
      const status = settlement.kind === "chain_error" ? 502 : 402;
      return Response.json(
        {
          id,
          status: "failed_settlement",
          error: settlement.kind,
          message: settlement.message,
        },
        { status },
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
          settlementTxHash: settlement.txHash,
          settlementStatus: settlement.status,
        },
      }),
      db.agent.update({
        where: { id: agentId },
        data: { totalCalls: { increment: 1 } },
      }),
      logActivity(
        "payment",
        `image · ${agent.name} · ${totalUsd} USDC — creator ${creator.slice(0, 8)}... gets ${commissionUsd} USDC, gemini ${geminiCostUsd} USDC${settlement.status === "confirmed" ? ` · tx ${settlement.txHash.slice(0, 10)}…` : ""}`,
      ),
    ]);

    return Response.json({
      id,
      status: "ready",
      imageUrl: url,
      // Raw base64 for MCP clients that want to return an inline image
      // content-block to the calling LLM instead of just a URL.
      imageBase64: result.base64,
      mimeType: result.mimeType,
      sizeBytes: buffer.length,
      model,
      breakdown: { commissionUsd, geminiCostUsd, platformFeeUsd, totalUsd },
      settlement: {
        status: settlement.status,
        txHash: settlement.txHash,
        blockNumber: settlement.blockNumber,
      },
      tokens: {
        prompt: result.usage.promptTokens,
        output: result.usage.outputTokens,
        thoughts: result.usage.thoughtsTokens,
      },
      agent: { id: agent.id, name: agent.name, creatorAddress: creator },
      createdAt: updated.createdAt,
      readyAt: updated.readyAt,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    await db.imageGeneration.update({
      where: { id },
      data: { status: "failed", errorMessage },
    });
    return Response.json({ id, status: "failed", error: errorMessage }, { status: 502 });
  }
}
