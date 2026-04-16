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

  const claimedBy = body.expertAddress || config.humanExpert.address;
  const updated = await db.task.update({
    where: { id },
    data: { status: "claimed", claimedBy, claimedAt: new Date() },
  });

  await logActivity("task", `Task claimed by expert ${String(claimedBy).slice(0, 8)}...`);
  return Response.json(serializeTask(updated));
}
