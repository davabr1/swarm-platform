import { db } from "@/lib/db";
import { serializeTask } from "@/lib/serializeAgent";
import { logActivity } from "@/lib/activity";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/tasks/[id]/submit">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const task = await db.task.findUnique({ where: { id } });
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
  if (task.status !== "claimed") return Response.json({ error: "Task is not claimed" }, { status: 400 });

  const updated = await db.task.update({
    where: { id },
    data: { status: "completed", result: body.result ?? null, completedAt: new Date() },
  });

  await logActivity(
    "payment",
    `Task completed — ${task.bounty} USDC paid to expert ${String(task.claimedBy ?? "").slice(0, 8)}...`
  );
  return Response.json(serializeTask(updated, { viewerAddress: task.claimedBy ?? undefined }));
}
