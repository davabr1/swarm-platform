import { db } from "@/lib/db";
import { refundBounty } from "@/lib/taskEscrow";
import { logActivity } from "@/lib/activity";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
// Refund paths sign a real chain tx per task; a sweep of N expired tasks
// takes ~2s per refund in the worst case, so widen the default 15s budget.
export const maxDuration = 60;

// Fires on Supabase pg_cron (see supabase/expire-tasks-cron.sql). Finds
// every open task whose expiresAt has passed, refunds the poster via
// treasuryTransfer, and flips status to "cancelled". Safety net for
// bounties that would otherwise sit stranded in platform custody forever.
// Idempotent — re-running on an already-swept set is a no-op.
//
// Auth: if `CRON_SECRET` is set in env, the request must carry a matching
// `Authorization: Bearer <secret>` header (the Supabase SQL job is
// configured to send it). Unset env var = endpoint is open, which is
// defensible because the sweep only processes already-expired work and
// can't cause economic harm. Supabase fires this via HTTP POST; we accept
// both POST and GET so an ops human can curl it manually if needed.
async function handler(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (secret && auth !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const expired = await db.task.findMany({
    where: {
      status: "open",
      expiresAt: { lte: now },
    },
    select: {
      id: true,
      description: true,
      bounty: true,
      bountyMicroUsd: true,
      postedBy: true,
    },
  });

  if (expired.length === 0) {
    return Response.json({ swept: 0, refunds: [] });
  }

  const refunds: Array<{
    id: string;
    status: "refunded" | "skipped" | "failed";
    txHash?: string;
    message?: string;
  }> = [];

  for (const t of expired) {
    if (!t.postedBy) {
      refunds.push({ id: t.id, status: "skipped", message: "no poster address" });
      continue;
    }

    let refundTxHash: string | null = null;
    let refundBlockNumber: number | null = null;

    if (t.bountyMicroUsd > BigInt(0)) {
      const refund = await refundBounty({
        taskId: t.id,
        bountyMicroUsd: t.bountyMicroUsd,
        posterAddress: t.postedBy,
        description: `Task auto-expired (7d unclaimed): ${String(t.description).slice(0, 60)}`,
      });
      if (!refund.ok) {
        refunds.push({ id: t.id, status: "failed", message: refund.message });
        continue;
      }
      refundTxHash = refund.txHash;
      refundBlockNumber = refund.blockNumber;
    }

    await db.task.update({
      where: { id: t.id },
      data: {
        status: "cancelled",
        cancelledAt: now,
        payoutTxHash: refundTxHash,
        payoutBlockNumber: refundBlockNumber,
      },
    });

    await logActivity(
      "task",
      `Task auto-expired: "${String(t.description).slice(0, 50)}…" — ${t.bounty} USDC refunded to ${t.postedBy.slice(0, 8)}...${refundTxHash ? ` · ${refundTxHash.slice(0, 10)}…` : ""}`,
    );

    refunds.push({
      id: t.id,
      status: "refunded",
      txHash: refundTxHash ?? undefined,
    });
  }

  return Response.json({ swept: refunds.length, refunds });
}

export { handler as GET, handler as POST };
