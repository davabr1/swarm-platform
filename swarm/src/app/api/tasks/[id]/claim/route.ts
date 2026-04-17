import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { serializeTask } from "@/lib/serializeAgent";
import { logActivity } from "@/lib/activity";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/tasks/[id]/claim">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const task = await db.task.findUnique({ where: { id } });
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
  if (task.status !== "open") return Response.json({ error: "Task is not open" }, { status: 400 });

  const claimedBy: string = body.expertAddress || config.humanExpert.address;
  const claimerLower = claimedBy.toLowerCase();

  if (task.assignedTo && task.assignedTo.toLowerCase() !== claimerLower) {
    return Response.json(
      { error: `This task is reserved for ${task.assignedTo}.` },
      { status: 403 },
    );
  }

  if (task.requiredSkill) {
    const claimerAgents = await db.agent.findMany({
      where: {
        OR: [
          { creatorAddress: { equals: claimedBy, mode: "insensitive" } },
          { walletAddress: { equals: claimedBy, mode: "insensitive" } },
        ],
      },
      select: { skill: true },
    });
    const need = task.requiredSkill.toLowerCase();
    const has = claimerAgents.some((a) => a.skill.toLowerCase() === need);
    if (!has) {
      return Response.json(
        { error: `Claimer must have skill "${task.requiredSkill}".` },
        { status: 403 },
      );
    }
  }

  if (task.minReputation != null && task.minReputation > 0) {
    // Reputation is the average rating posters gave this claimer on their
    // previously completed human work — not their agents' self-reputation.
    const priorRated = await db.task.findMany({
      where: {
        claimedBy: { equals: claimedBy, mode: "insensitive" },
        status: "completed",
        posterRating: { not: null },
        NOT: { id: task.id },
      },
      select: { posterRating: true },
    });

    // Zero-review bypass: new claimers with no track record get their first shot.
    if (priorRated.length > 0) {
      const avg =
        priorRated.reduce((s, t) => s + (t.posterRating ?? 0), 0) / priorRated.length;
      if (avg < task.minReputation) {
        return Response.json(
          {
            error: `Minimum reputation ${task.minReputation.toFixed(
              1,
            )} required; your average rating from posters is ${avg.toFixed(1)} across ${priorRated.length} completed task${priorRated.length === 1 ? "" : "s"}.`,
          },
          { status: 403 },
        );
      }
    }
  }

  const updated = await db.task.update({
    where: { id },
    data: { status: "claimed", claimedBy, claimedAt: new Date() },
  });

  await logActivity("task", `Task claimed by expert ${String(claimedBy).slice(0, 8)}...`);
  return Response.json(serializeTask(updated, { viewerAddress: claimedBy }));
}
