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
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

// Map built-in image agent ids → Gemini model. Keeps the route thin.
const AGENT_MODELS: Record<string, string> = Object.fromEntries(
  Object.values(config.imageAgents).map((a) => [a.id, a.model]),
);

function extensionForMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const agentId: string | undefined = body.agentId;
  const prompt: string | undefined = body.prompt;
  const askerAddress: string =
    typeof body.askerAddress === "string" && body.askerAddress
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
    const ext = extensionForMime(result.mimeType);
    const filename = `${id}.${ext}`;
    const dir = path.join(process.cwd(), "public", "generated");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), buffer);

    const url = `${req.nextUrl.origin}/generated/${filename}`;

    const imageCost = computeImageCost(model);
    const tokenCost = computeGeminiCost({
      prompt: result.usage.promptTokens,
      output: 0,
      thoughts: result.usage.thoughtsTokens,
    });
    const geminiCost = Math.round((imageCost + tokenCost) * 10_000) / 10_000;
    const commission = parsePrice(agent.price);
    const platformFee = Math.round((commission + geminiCost) * 0.05 * 10_000) / 10_000;
    const total = Math.round((commission + geminiCost + platformFee) * 10_000) / 10_000;

    const commissionUsd = formatUsd(commission);
    const geminiCostUsd = formatUsd(geminiCost);
    const platformFeeUsd = formatUsd(platformFee);
    const totalUsd = formatUsd(total);

    const updated = await db.imageGeneration.update({
      where: { id },
      data: {
        status: "ready",
        imageUrl: url,
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
      },
    });

    await db.agent.update({
      where: { id: agentId },
      data: { totalCalls: { increment: 1 } },
    });

    const creator = agent.creatorAddress ?? agent.walletAddress;
    await logActivity(
      "payment",
      `image · ${agent.name} · $${totalUsd} — creator ${creator.slice(0, 8)}... gets $${commissionUsd}, gemini $${geminiCostUsd}`,
    );

    return Response.json({
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
