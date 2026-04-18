import { db } from "@/lib/db";
import { serializeTask } from "@/lib/serializeAgent";
import { logActivity } from "@/lib/activity";
import { payoutBounty } from "@/lib/taskEscrow";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/tasks/[id]/submit">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const task = await db.task.findUnique({ where: { id } });
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
  if (task.status !== "claimed") return Response.json({ error: "Task is not claimed" }, { status: 400 });
  if (!task.claimedBy) {
    return Response.json({ error: "Task has no claimer" }, { status: 400 });
  }

  // Legacy rows (posted before Phase 3) carry bountyMicroUsd=0 and no escrow
  // transaction — skip the on-chain payout for those. Everything posted under
  // the treasury model has the full amount escrowed at post time.
  const bountyMicroUsd = task.bountyMicroUsd;
  let payoutTxHash: string | null = null;
  let payoutBlockNumber: number | null = null;
  if (bountyMicroUsd > BigInt(0)) {
    const payout = await payoutBounty({
      taskId: id,
      bountyMicroUsd,
      claimerAddress: task.claimedBy,
      description: `Task payout: ${String(task.description).slice(0, 80)}`,
    });
    if (!payout.ok) {
      return Response.json(
        {
          error: payout.kind,
          message: payout.message,
        },
        { status: 502 }
      );
    }
    payoutTxHash = payout.txHash;
    payoutBlockNumber = payout.blockNumber;
  }

  const updated = await db.task.update({
    where: { id },
    data: {
      status: "completed",
      result: body.result ?? null,
      completedAt: new Date(),
      payoutTxHash,
      payoutBlockNumber,
    },
  });

  await logActivity(
    "payment",
    `Task completed — ${task.bounty} USDC paid to expert ${String(task.claimedBy).slice(0, 8)}...`
  );
  return Response.json(serializeTask(updated, { viewerAddress: task.claimedBy }));
}
