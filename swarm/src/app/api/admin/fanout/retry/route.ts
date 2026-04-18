import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { treasuryTransfer } from "@/lib/treasury";
import { logActivity } from "@/lib/activity";

// Retry a failed commission fan-out. Row identified by Transaction.id — the
// failed row was written by postSettleFanout.ts with status="failed" and
// no txHash. On success we update the same row in place (rather than
// inserting a new one) so the ledger stays clean.
//
// Idempotency: if the row already has status="confirmed" + a txHash, we
// return 200 without re-sending. If it has status="failed" but the
// treasury has since drained, the retry will itself fail — the row stays
// "failed" with a new error message and can be retried again after funding.

function equalSafe(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected) return new Response("admin disabled", { status: 503 });

  let body: { password?: unknown; transactionId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || !equalSafe(password, expected)) {
    return new Response("unauthorized", { status: 401 });
  }
  const transactionId =
    typeof body.transactionId === "string" ? body.transactionId : "";
  if (!transactionId) {
    return Response.json(
      { ok: false, error: "transactionId required" },
      { status: 400 },
    );
  }

  const row = await db.transaction.findUnique({ where: { id: transactionId } });
  if (!row) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }
  if (row.kind !== "earning" || row.refType !== "x402_fanout") {
    return Response.json(
      { ok: false, error: "not a fan-out row" },
      { status: 400 },
    );
  }
  if (row.status === "confirmed" && row.txHash) {
    return Response.json({
      ok: true,
      status: "already_confirmed",
      txHash: row.txHash,
    });
  }

  try {
    const result = await treasuryTransfer(
      row.walletAddress,
      row.grossMicroUsd,
    );
    const updated = await db.transaction.update({
      where: { id: row.id },
      data: {
        status: "confirmed",
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        description: `commission · retried · ${row.description?.split(" (chain failed")[0] ?? ""}`.trim(),
      },
    });
    await logActivity(
      "payment",
      `commission retry · ${row.walletAddress.slice(0, 6)}…${row.walletAddress.slice(-4)} · $${(Number(row.grossMicroUsd) / 1e6).toFixed(3)}`,
    );
    return Response.json({
      ok: true,
      status: "confirmed",
      txHash: updated.txHash,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.transaction.update({
      where: { id: row.id },
      data: {
        description: `commission · retry failed · ${message.slice(0, 80)}`,
      },
    });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
