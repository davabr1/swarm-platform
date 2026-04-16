import { db } from "@/lib/db";
import type { NextRequest } from "next/server";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/guidance/[id]">) {
  const { id } = await ctx.params;
  const row = await db.guidanceRequest.findUnique({ where: { id } });
  if (!row) return Response.json({ error: "Guidance request not found" }, { status: 404 });

  const ready = row.status === "ready";
  return Response.json({
    id: row.id,
    agentId: row.agentId,
    askerAddress: row.askerAddress,
    status: row.status,
    response: ready ? row.response : null,
    errorMessage: row.errorMessage,
    breakdown: ready
      ? {
          commissionUsd: row.commissionUsd,
          geminiCostUsd: row.geminiCostUsd,
          platformFeeUsd: row.platformFeeUsd,
          totalUsd: row.totalUsd,
        }
      : null,
    tokens: ready
      ? {
          prompt: row.promptTokens,
          output: row.outputTokens,
          thoughts: row.thoughtsTokens,
        }
      : null,
    createdAt: row.createdAt,
    readyAt: row.readyAt,
  });
}
