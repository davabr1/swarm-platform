import { db } from "@/lib/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/image/[id]/meta">,
) {
  const { id } = await ctx.params;
  const row = await db.imageGeneration.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const agent = await db.agent.findUnique({
    where: { id: row.agentId },
    select: { id: true, name: true, creatorAddress: true, walletAddress: true },
  });

  return NextResponse.json({
    id: row.id,
    status: row.status,
    prompt: row.prompt,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    readyAt: row.readyAt,
    breakdown: {
      commissionUsd: row.commissionUsd,
      geminiCostUsd: row.geminiCostUsd,
      platformFeeUsd: row.platformFeeUsd,
      totalUsd: row.totalUsd,
    },
    settlementTxHash: row.settlementTxHash,
    agent,
  });
}
