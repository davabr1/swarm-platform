import "server-only";
import { db } from "./db";
import { config } from "./config";
import { treasuryTransfer } from "./treasury";

// Single atomic settlement path shared by /api/guidance and /api/image.
//
// Why "conditional UPDATE first, then chain tx"?
//   If we moved USDC on-chain first and the DB write failed, the user would
//   be charged on-chain without their deposited-balance counter updating —
//   very hard to reconcile. Debiting the DB first lets us reverse cleanly
//   when the chain tx fails: just `INCREMENT` the balance back + log a
//   refund row. Worst case on DB-write-after-chain-success is a row mismatch,
//   which we recover from by retrying the DB write.
//
// Concurrency: the conditional UPDATE is atomic in Postgres — two parallel
// requests both trying to drain the last 0.5 USDC of a 1 USDC balance will
// serialize, and the second sees `updated: 0` and bails with 402.

export interface SettleContext {
  payerAddress: string;
  recipientAddress: string;
  totalMicroUsd: bigint;
  // Slice of `totalMicroUsd` that belongs to a user-created agent's creator.
  // If > 0, a second on-chain transfer sends this to `commissionAddress`.
  commissionMicroUsd: bigint;
  commissionAddress: string | null;
  isAutonomous: boolean;
  refType: "guidance" | "image";
  refId: string;
  description: string;
}

export type SettlementOutcome =
  | {
      ok: true;
      txHash: string;
      blockNumber: number;
      status: "confirmed" | "simulated";
      commissionTxHash?: string;
      commissionStatus?: "confirmed" | "failed" | "simulated";
    }
  | {
      ok: false;
      kind: "insufficient_balance" | "cap_exhausted" | "chain_error";
      message: string;
    };

// Returns null when the user hasn't set an allowance — autonomous spend is
// then bounded only by deposited balance. The stored value is a decimal
// string (Prisma Decimal); NaN / negative / empty means "unset".
function resolveCapMicroUsd(stored: string | null): bigint | null {
  if (!stored) return null;
  const parsed = Number(stored);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return BigInt(Math.round(parsed * 1_000_000));
}

// Reserves the balance (conditional UPDATE), calls the on-chain transfer,
// writes the ledger row. On chain failure, compensates the reservation.
export async function settleFromBalance(ctx: SettleContext): Promise<SettlementOutcome> {
  // Simulated mode (local dev / tests) still debits the DB balance so the
  // UI flow works, but skips the on-chain transfer and marks the row as
  // simulated. Mirrors x402.ts behavior.
  const simulated = !config.x402Enforce;

  const wallet = ctx.payerAddress.toLowerCase();

  // Ensure profile row exists so the conditional UPDATE targets something.
  await db.userProfile.upsert({
    where: { walletAddress: wallet },
    update: {},
    create: { walletAddress: wallet },
  });

  const profile = await db.userProfile.findUnique({ where: { walletAddress: wallet } });
  if (!profile) {
    return { ok: false, kind: "chain_error", message: "profile upsert failed" };
  }

  const capMicroUsd = resolveCapMicroUsd(profile.autonomousCapUsd);

  // Preflight check for a cleaner 402 reason. The conditional UPDATE below
  // is authoritative — this just lets us return the more specific
  // "cap_exhausted" code when it's the allowance (not the balance) that
  // blocks. Skipped entirely when the user hasn't set an allowance: in
  // that case autonomous spend is bounded only by deposited balance.
  if (ctx.isAutonomous && capMicroUsd !== null) {
    if (profile.autonomousSpentMicroUsd + ctx.totalMicroUsd > capMicroUsd) {
      return {
        ok: false,
        kind: "cap_exhausted",
        message: `autonomous allowance exceeded (${capMicroUsd.toString()} micro-USDC)`,
      };
    }
  }

  // Atomic reserve: debits balance + (if autonomous) increments spent, only
  // if both invariants hold. Raw SQL so we can express the compound guard
  // in one statement — Prisma's updateMany doesn't express "autonomousSpent
  // + delta <= cap" cleanly. When no allowance is set we drop the cap
  // guard and enforce only the balance.
  const reserved =
    ctx.isAutonomous && capMicroUsd !== null
      ? await db.$executeRaw`
        UPDATE "UserProfile"
           SET "balanceMicroUsd"        = "balanceMicroUsd" - ${ctx.totalMicroUsd}::bigint,
               "autonomousSpentMicroUsd" = "autonomousSpentMicroUsd" + ${ctx.totalMicroUsd}::bigint,
               "updatedAt"              = CURRENT_TIMESTAMP
         WHERE "walletAddress" = ${wallet}
           AND "balanceMicroUsd" >= ${ctx.totalMicroUsd}::bigint
           AND "autonomousSpentMicroUsd" + ${ctx.totalMicroUsd}::bigint <= ${capMicroUsd}::bigint
      `
      : ctx.isAutonomous
        ? await db.$executeRaw`
        UPDATE "UserProfile"
           SET "balanceMicroUsd"        = "balanceMicroUsd" - ${ctx.totalMicroUsd}::bigint,
               "autonomousSpentMicroUsd" = "autonomousSpentMicroUsd" + ${ctx.totalMicroUsd}::bigint,
               "updatedAt"              = CURRENT_TIMESTAMP
         WHERE "walletAddress" = ${wallet}
           AND "balanceMicroUsd" >= ${ctx.totalMicroUsd}::bigint
      `
        : await db.$executeRaw`
        UPDATE "UserProfile"
           SET "balanceMicroUsd" = "balanceMicroUsd" - ${ctx.totalMicroUsd}::bigint,
               "updatedAt"       = CURRENT_TIMESTAMP
         WHERE "walletAddress" = ${wallet}
           AND "balanceMicroUsd" >= ${ctx.totalMicroUsd}::bigint
      `;

  if (reserved === 0) {
    // Re-read to tell the caller *which* invariant failed. Either the
    // balance is insufficient or the autonomous allowance is exhausted.
    const fresh = await db.userProfile.findUnique({ where: { walletAddress: wallet } });
    if (fresh && ctx.isAutonomous) {
      const freshCap = resolveCapMicroUsd(fresh.autonomousCapUsd);
      if (
        freshCap !== null &&
        fresh.autonomousSpentMicroUsd + ctx.totalMicroUsd > freshCap
      ) {
        return {
          ok: false,
          kind: "cap_exhausted",
          message: `autonomous allowance exceeded (${freshCap.toString()} micro-USDC)`,
        };
      }
    }
    return {
      ok: false,
      kind: "insufficient_balance",
      message: "deposited balance too low for this call",
    };
  }

  // Reservation held — now move USDC on-chain from the treasury.
  let txHash: string;
  let blockNumber: number;
  let chainStatus: "confirmed" | "simulated";

  if (simulated) {
    txHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
    blockNumber = 0;
    chainStatus = "simulated";
  } else {
    try {
      const primarySlice = ctx.totalMicroUsd - ctx.commissionMicroUsd;
      const result = await treasuryTransfer(ctx.recipientAddress, primarySlice);
      txHash = result.txHash;
      blockNumber = result.blockNumber;
      chainStatus = "confirmed";
    } catch (err) {
      // Compensate the reservation + log a refund row on the user's wallet.
      // Keeps the ledger honest: an outsider watching `walletAddress`'s
      // rows sees `-0.23 spend (failed)` followed by `+0.23 refund`.
      const message = err instanceof Error ? err.message : String(err);
      await db.$transaction([
        db.userProfile.update({
          where: { walletAddress: wallet },
          data: {
            balanceMicroUsd: { increment: ctx.totalMicroUsd },
            ...(ctx.isAutonomous
              ? { autonomousSpentMicroUsd: { decrement: ctx.totalMicroUsd } }
              : {}),
          },
        }),
        db.transaction.create({
          data: {
            walletAddress: wallet,
            kind: "refund",
            deltaMicroUsd: ctx.totalMicroUsd,
            grossMicroUsd: ctx.totalMicroUsd,
            description: `refund · ${ctx.description}`,
            refType: ctx.refType,
            refId: ctx.refId,
            status: "confirmed",
          },
        }),
      ]);
      return { ok: false, kind: "chain_error", message };
    }
  }

  // Primary ledger row for the payer.
  await db.transaction.create({
    data: {
      walletAddress: wallet,
      kind: ctx.isAutonomous ? "autonomous_spend" : "manual_spend",
      deltaMicroUsd: -ctx.totalMicroUsd,
      grossMicroUsd: ctx.totalMicroUsd,
      description: ctx.description,
      refType: ctx.refType,
      refId: ctx.refId,
      txHash: chainStatus === "confirmed" ? txHash : null,
      blockNumber: chainStatus === "confirmed" ? blockNumber : null,
      status: chainStatus,
    },
  });

  // Commission split (best-effort second transfer). A failed commission
  // transfer does NOT fail the primary call — the spender has already been
  // charged and served. We log the earning row as "failed" instead so the
  // creator still sees the attempt + can reconcile later.
  let commissionTxHash: string | undefined;
  let commissionStatus: "confirmed" | "failed" | "simulated" | undefined;
  if (
    ctx.commissionMicroUsd > BigInt(0) &&
    ctx.commissionAddress &&
    ctx.commissionAddress.toLowerCase() !== wallet
  ) {
    if (simulated) {
      commissionStatus = "simulated";
      await db.transaction.create({
        data: {
          walletAddress: ctx.commissionAddress.toLowerCase(),
          kind: "earning",
          deltaMicroUsd: ctx.commissionMicroUsd,
          grossMicroUsd: ctx.commissionMicroUsd,
          description: `commission · ${ctx.description}`,
          refType: ctx.refType,
          refId: ctx.refId,
          status: "simulated",
        },
      });
    } else {
      try {
        const result = await treasuryTransfer(
          ctx.commissionAddress,
          ctx.commissionMicroUsd,
        );
        commissionTxHash = result.txHash;
        commissionStatus = "confirmed";
        await db.transaction.create({
          data: {
            walletAddress: ctx.commissionAddress.toLowerCase(),
            kind: "earning",
            deltaMicroUsd: ctx.commissionMicroUsd,
            grossMicroUsd: ctx.commissionMicroUsd,
            description: `commission · ${ctx.description}`,
            refType: ctx.refType,
            refId: ctx.refId,
            txHash: result.txHash,
            blockNumber: result.blockNumber,
            status: "confirmed",
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        commissionStatus = "failed";
        await db.transaction.create({
          data: {
            walletAddress: ctx.commissionAddress.toLowerCase(),
            kind: "earning",
            deltaMicroUsd: ctx.commissionMicroUsd,
            grossMicroUsd: ctx.commissionMicroUsd,
            description: `commission · ${ctx.description} (chain failed: ${message.slice(0, 80)})`,
            refType: ctx.refType,
            refId: ctx.refId,
            status: "failed",
          },
        });
      }
    }
  }

  return {
    ok: true,
    txHash,
    blockNumber,
    status: chainStatus,
    commissionTxHash,
    commissionStatus,
  };
}
