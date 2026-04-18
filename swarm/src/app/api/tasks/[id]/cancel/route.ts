import { db } from "@/lib/db";
import { serializeTask } from "@/lib/serializeAgent";
import { logActivity } from "@/lib/activity";
import { readManualSession } from "@/lib/manualSession";
import { refundBounty } from "@/lib/taskEscrow";
import type { NextRequest } from "next/server";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/tasks/[id]/cancel">) {
  const { id } = await ctx.params;

  const session = await readManualSession();
  if (!session) {
    return Response.json(
      { error: "not_authenticated", message: "Sign in with your wallet to cancel tasks." },
      { status: 401 }
    );
  }

  const task = await db.task.findUnique({ where: { id } });
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });

  const poster = task.postedBy?.toLowerCase();
  if (!poster || poster !== session.address) {
    return Response.json(
      { error: "forbidden", message: "Only the poster can cancel this task." },
      { status: 403 }
    );
  }
  if (task.status !== "open") {
    return Response.json(
      { error: "invalid_state", message: `Task is ${task.status}; only open tasks can be cancelled.` },
      { status: 400 }
    );
  }

  // Refund only when the task carries a real escrow (Phase 3+). Legacy rows
  // posted before the treasury model have bountyMicroUsd=0 — nothing to
  // return to the poster.
  if (task.bountyMicroUsd > BigInt(0)) {
    await refundBounty({
      taskId: id,
      bountyMicroUsd: task.bountyMicroUsd,
      posterAddress: poster,
      description: `Task refund: ${String(task.description).slice(0, 80)}`,
    });
  }

  const updated = await db.task.update({
    where: { id },
    data: { status: "cancelled", cancelledAt: new Date() },
  });

  await logActivity(
    "task",
    `Task cancelled by ${poster.slice(0, 8)}... — ${task.bounty} USDC refunded`
  );
  return Response.json(serializeTask(updated, { viewerAddress: poster }));
}
