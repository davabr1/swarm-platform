import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { giveFeedback } from "@/lib/erc8004";
import { logActivity } from "@/lib/activity";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/agents/[id]/rate">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const score = Number(body.score);
  if (!score || score < 1 || score > 5) {
    return Response.json({ error: "Score must be 1-5" }, { status: 400 });
  }

  const agent = await db.agent.findUnique({ where: { id } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  if (agent.agentId) {
    try {
      await giveFeedback(
        config.orchestrator.privateKey,
        BigInt(agent.agentId),
        score,
        agent.skill.toLowerCase().replace(/\s+/g, "_"),
        `/api/agents/${agent.id}/call`
      );
      await logActivity("reputation", `${agent.name} rated ${score}/5 — on-chain reputation updated`);
    } catch (err) {
      console.error("ERC-8004 feedback failed:", err instanceof Error ? err.message : err);
    }
  }

  const newCount = agent.ratingsCount + 1;
  const newAvg = (agent.reputation * agent.ratingsCount + score) / newCount;
  const rounded = Math.round(newAvg * 10) / 10;

  const updated = await db.agent.update({
    where: { id },
    data: { reputation: rounded, ratingsCount: newCount },
  });

  return Response.json({
    success: true,
    reputation: { count: updated.ratingsCount, averageScore: updated.reputation },
  });
}
