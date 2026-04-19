import "server-only";
import { db } from "./db";
import { treasuryTransfer } from "./treasury";
import { logActivity } from "./activity";

export interface FanoutSplitArgs {
  creatorAddress: string | null;
  commissionMicroUsd: bigint;
  settlementTxHash: string;
  // Used for Transaction.refType + refId so the earning row points back
  // at the underlying guidance/image/task row.
  refType: "guidance" | "image" | "task";
  refId: string;
  description: string;
  // The payer (x402 signer) — we skip self-commission when creator == payer.
  payer: string;
}

export type FanoutOutcome =
  | {
      ok: true;
      status: "confirmed" | "skipped";
      txHash?: string;
    }
  | {
      ok: false;
      status: "failed";
      message: string;
    };

// Best-effort commission transfer after x402 settles the primary payment
// to the platform payout address. Failure is non-fatal — the user already
// got their service; the failed earning row is visible in /admin (Phase 5)
// and can be retried manually.
//
// Skipped when:
//   - commissionMicroUsd is 0 (platform-owned agent, no split)
//   - creatorAddress is missing
//   - creator == payer (would be paying themselves)
export async function fanoutSplit(args: FanoutSplitArgs): Promise<FanoutOutcome> {
  const creator = args.creatorAddress?.toLowerCase();
  const payer = args.payer.toLowerCase();

  if (args.commissionMicroUsd <= BigInt(0) || !creator || creator === payer) {
    return { ok: true, status: "skipped" };
  }

  try {
    const result = await treasuryTransfer(creator, args.commissionMicroUsd);
    await db.transaction.create({
      data: {
        walletAddress: creator,
        kind: "earning",
        deltaMicroUsd: args.commissionMicroUsd,
        grossMicroUsd: args.commissionMicroUsd,
        description: `commission · ${args.description}`,
        refType: "x402_fanout",
        refId: args.refId,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        status: "confirmed",
      },
    });
    await logActivity(
      "payment",
      `commission · ${truncate(creator)} · $${formatMicro(args.commissionMicroUsd)}`,
    );
    return { ok: true, status: "confirmed", txHash: result.txHash };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.transaction.create({
      data: {
        walletAddress: creator,
        kind: "earning",
        deltaMicroUsd: args.commissionMicroUsd,
        grossMicroUsd: args.commissionMicroUsd,
        description: `commission · ${args.description} (chain failed: ${message.slice(0, 80)})`,
        refType: "x402_fanout",
        refId: args.refId,
        status: "failed",
      },
    });
    return { ok: false, status: "failed", message };
  }
}

// Refunds the delta between the x402 ceiling (what actually settled) and the
// measured actual cost. The x402 authorization is signed against a fixed
// amount before the Gemini call runs — so we reserve a conservative ceiling,
// settle that ceiling, then wire the overage back to the payer from the
// treasury. Non-fatal if it fails — the user already got their service; the
// failed refund row is visible in the profile ledger and can be retried.
//
// Skipped when:
//   - overageMicroUsd <= 0 (actual met or exceeded the ceiling — no refund owed)
export async function refundOverage(args: {
  payer: string;
  ceilingMicroUsd: bigint;
  actualMicroUsd: bigint;
  settlementTxHash: string;
  refType: "guidance" | "image" | "task";
  refId: string;
  description: string;
}): Promise<FanoutOutcome> {
  const overage = args.ceilingMicroUsd - args.actualMicroUsd;
  if (overage <= BigInt(0)) {
    return { ok: true, status: "skipped" };
  }

  const payer = args.payer.toLowerCase();

  try {
    const result = await treasuryTransfer(payer, overage);
    await db.transaction.create({
      data: {
        walletAddress: payer,
        kind: "refund",
        deltaMicroUsd: overage,
        grossMicroUsd: overage,
        description: `overage refunded · ${args.description}`,
        refType: args.refType,
        refId: args.refId,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        status: "confirmed",
      },
    });
    await logActivity(
      "payment",
      `overage refund · ${truncate(payer)} · $${formatMicro(overage)}`,
    );
    return { ok: true, status: "confirmed", txHash: result.txHash };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.transaction.create({
      data: {
        walletAddress: payer,
        kind: "refund",
        deltaMicroUsd: overage,
        grossMicroUsd: overage,
        description: `overage refunded · ${args.description} (chain failed: ${message.slice(0, 80)})`,
        refType: args.refType,
        refId: args.refId,
        status: "failed",
      },
    });
    return { ok: false, status: "failed", message };
  }
}

// Records the primary x402 settlement as an on-ledger row tied to the payer.
// The underlying USDC move is MCP → platform (via x402 facilitator); this
// just mirrors it into our audit log for the Transactions panel. Returns
// the new Transaction row's id so callers (e.g. task escrow) can link to it.
export async function recordX402Settlement(args: {
  payer: string;
  totalMicroUsd: bigint;
  settlementTxHash: string;
  refType: "guidance" | "image" | "task";
  refId: string;
  description: string;
}): Promise<{ transactionId: string }> {
  const row = await db.transaction.create({
    data: {
      walletAddress: args.payer.toLowerCase(),
      kind: "x402_settle",
      deltaMicroUsd: -args.totalMicroUsd,
      grossMicroUsd: args.totalMicroUsd,
      description: args.description,
      refType: args.refType,
      refId: args.refId,
      txHash: args.settlementTxHash,
      status: "confirmed",
    },
  });
  await logActivity(
    "payment",
    `x402 · ${truncate(args.payer)} · $${formatMicro(args.totalMicroUsd)}`,
  );
  return { transactionId: row.id };
}

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatMicro(micro: bigint): string {
  const whole = Number(micro) / 1_000_000;
  return whole.toFixed(whole < 1 ? 3 : 2);
}
