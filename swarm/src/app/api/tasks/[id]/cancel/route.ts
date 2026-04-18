import { ethers } from "ethers";
import { db } from "@/lib/db";
import { serializeTask } from "@/lib/serializeAgent";
import { logActivity } from "@/lib/activity";
import { refundBounty } from "@/lib/taskEscrow";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/tasks/[id]/cancel">) {
  const { id } = await ctx.params;

  const signature = req.headers.get("x-cancel-signature");
  if (!signature) {
    return Response.json(
      {
        error: "missing_signature",
        message: "Provide an EIP-191 signature of `cancel-task:<taskId>` in the X-Cancel-Signature header.",
      },
      { status: 401 },
    );
  }

  const task = await db.task.findUnique({ where: { id } });
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });

  let recovered: string;
  try {
    recovered = ethers.verifyMessage(`cancel-task:${id}`, signature).toLowerCase();
  } catch {
    return Response.json(
      { error: "invalid_signature", message: "Could not recover signer from X-Cancel-Signature." },
      { status: 401 },
    );
  }

  const poster = task.postedBy?.toLowerCase();
  if (!poster || poster !== recovered) {
    return Response.json(
      { error: "forbidden", message: "Only the poster can cancel this task." },
      { status: 403 },
    );
  }
  if (task.status !== "open") {
    return Response.json(
      { error: "invalid_state", message: `Task is ${task.status}; only open tasks can be cancelled.` },
      { status: 400 },
    );
  }

  let refundTxHash: string | null = null;
  let refundBlockNumber: number | null = null;
  if (task.bountyMicroUsd > BigInt(0)) {
    const refund = await refundBounty({
      taskId: id,
      bountyMicroUsd: task.bountyMicroUsd,
      posterAddress: poster,
      description: `Task refund: ${String(task.description).slice(0, 80)}`,
    });
    if (!refund.ok) {
      return Response.json(
        { error: refund.kind, message: refund.message },
        { status: 502 },
      );
    }
    refundTxHash = refund.txHash;
    refundBlockNumber = refund.blockNumber;
  }

  const updated = await db.task.update({
    where: { id },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
      // Field reuse: for a cancelled task, payoutTxHash/payoutBlockNumber hold
      // the refund tx (not a claimer payout). The canonical record lives on the
      // Transaction row with kind="refund" — this mirror is just so the Task
      // row alone is self-describing on the tasks board.
      payoutTxHash: refundTxHash,
      payoutBlockNumber: refundBlockNumber,
    },
  });

  await logActivity(
    "task",
    `Task cancelled by ${poster.slice(0, 8)}... — ${task.bounty} USDC refunded${refundTxHash ? ` · ${refundTxHash.slice(0, 10)}…` : ""}`,
  );
  return Response.json(serializeTask(updated, { viewerAddress: poster }));
}
