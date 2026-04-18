import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { giveFeedback } from "@/lib/erc8004";
import { serializeTask } from "@/lib/serializeAgent";
import { logActivity } from "@/lib/activity";
import { resolveSession } from "@/lib/session";
import { readManualSession } from "@/lib/manualSession";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/tasks/[id]/rate">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const score = Number(body.score);

  if (!score || score < 1 || score > 5) {
    return Response.json({ error: "Score must be 1-5" }, { status: 400 });
  }

  // Accept either an MCP Bearer token OR the manual-session cookie. Legacy
  // callers that still send `body.viewer` are honored last so we don't
  // break the browser UI path mid-flight.
  const bearer = await resolveSession(req);
  if (bearer.kind === "invalid_token") {
    return Response.json(
      {
        error: "invalid_session",
        reason: bearer.reason,
        message: "Session token invalid or revoked — re-pair.",
      },
      { status: 401 },
    );
  }
  let viewer: string = "";
  if (bearer.kind === "session") {
    viewer = bearer.session.address.toLowerCase();
  } else {
    const manual = await readManualSession();
    if (manual) viewer = manual.address.toLowerCase();
    else if (typeof body.viewer === "string") viewer = body.viewer.toLowerCase();
  }

  const task = await db.task.findUnique({ where: { id } });
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
  if (task.status !== "completed") {
    return Response.json({ error: "Task is not completed yet" }, { status: 400 });
  }
  if (!viewer || viewer !== task.postedBy?.toLowerCase()) {
    return Response.json({ error: "Only the poster can rate this task" }, { status: 403 });
  }
  if (task.posterRating != null) {
    return Response.json({ error: "Task already rated" }, { status: 400 });
  }

  const updated = await db.task.update({
    where: { id },
    data: { posterRating: score, posterRatedAt: new Date() },
  });

  // Also roll the score into the claimer agent's reputation, if the claimer
  // is a registered agent. If the claimer is a wallet (human expert with a
  // registered expert agent), find the agent record to update.
  if (task.claimedBy) {
    const claimerAgent = await db.agent.findFirst({
      where: {
        OR: [
          { walletAddress: { equals: task.claimedBy, mode: "insensitive" } },
          { creatorAddress: { equals: task.claimedBy, mode: "insensitive" } },
        ],
      },
    });
    if (claimerAgent) {
      const newCount = claimerAgent.ratingsCount + 1;
      const newAvg = (claimerAgent.reputation * claimerAgent.ratingsCount + score) / newCount;
      const rounded = Math.round(newAvg * 10) / 10;
      await db.agent.update({
        where: { id: claimerAgent.id },
        data: { reputation: rounded, ratingsCount: newCount },
      });
      if (claimerAgent.agentId) {
        try {
          await giveFeedback(
            config.orchestrator.privateKey,
            BigInt(claimerAgent.agentId),
            score,
            claimerAgent.skill.toLowerCase().replace(/\s+/g, "_"),
            `/api/tasks/${task.id}`,
          );
        } catch (err) {
          console.error("ERC-8004 task-rate feedback failed:", err instanceof Error ? err.message : err);
        }
      }
      await logActivity(
        "reputation",
        `${claimerAgent.name} rated ${score}/5 on task ${task.id.slice(0, 16)}…`,
      );
    }
  }

  return Response.json(serializeTask(updated, { viewerAddress: viewer }));
}
