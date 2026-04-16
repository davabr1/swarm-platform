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

  if (task.requiredSkill || (task.minReputation != null && task.minReputation > 0)) {
    const claimerAgents = await db.agent.findMany({
      where: {
        OR: [
          { creatorAddress: { equals: claimedBy, mode: "insensitive" } },
          { walletAddress: { equals: claimedBy, mode: "insensitive" } },
        ],
      },
      select: { skill: true, reputation: true },
    });

    if (task.requiredSkill) {
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
      const best = claimerAgents.reduce((m, a) => Math.max(m, a.reputation ?? 0), 0);
      if (best < task.minReputation) {
        return Response.json(
          {
            error: `Minimum reputation ${task.minReputation.toFixed(1)} required; your best agent is ${best.toFixed(1)}.`,
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
