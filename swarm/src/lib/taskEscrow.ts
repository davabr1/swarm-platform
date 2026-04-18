import "server-only";
import { db } from "./db";
import { treasuryTransfer } from "./treasury";
import { config } from "./config";

// Task-bounty lifecycle: escrow at post time, payout at submit time, refund
// on cancel. All three are thin cousins of settleFromBalance — kept separate
// to avoid shoehorning task semantics into the guidance/image settlement
// contract.
//
//   post    → debit poster.balance, insert manual_spend Transaction
//             (no chain tx: treasury already holds the USDC from deposit)
//   submit  → treasuryTransfer(claimer, bounty), insert earning Transaction
//   cancel  → credit poster.balance, insert refund Transaction
//
// Balance debits use the same conditional-UPDATE pattern as
// settleFromBalance: two parallel posts against the last 0.5 USDC
// serialize, the second returns insufficient_balance.

export type EscrowOutcome =
  | { ok: true; transactionId: string }
  | { ok: false; kind: "insufficient_balance"; message: string };

export async function escrowBounty(params: {
  taskId: string;
  bountyMicroUsd: bigint;
  posterAddress: string;
  description: string;
}): Promise<EscrowOutcome> {
  const wallet = params.posterAddress.toLowerCase();

  await db.userProfile.upsert({
    where: { walletAddress: wallet },
    update: {},
    create: { walletAddress: wallet },
  });

  const reserved = await db.$executeRaw`
    UPDATE "UserProfile"
       SET "balanceMicroUsd" = "balanceMicroUsd" - ${params.bountyMicroUsd}::bigint,
           "updatedAt"       = CURRENT_TIMESTAMP
     WHERE "walletAddress"   = ${wallet}
       AND "balanceMicroUsd" >= ${params.bountyMicroUsd}::bigint
  `;
  if (reserved === 0) {
    return {
      ok: false,
      kind: "insufficient_balance",
      message: "deposited balance too low to escrow this bounty",
    };
  }

  const row = await db.transaction.create({
    data: {
      walletAddress: wallet,
      kind: "manual_spend",
      deltaMicroUsd: -params.bountyMicroUsd,
      grossMicroUsd: params.bountyMicroUsd,
      description: params.description,
      refType: "task",
      refId: params.taskId,
      status: "confirmed",
    },
  });
  return { ok: true, transactionId: row.id };
}

export type PayoutOutcome =
  | {
      ok: true;
      txHash: string;
      blockNumber: number;
      status: "confirmed" | "simulated";
    }
  | { ok: false; kind: "chain_error"; message: string };

// Pays bounty out to the claimer via treasuryTransfer. No balance mutation
// on the claimer side — they receive USDC directly on-chain. The escrow was
// debited from the poster at post time, so the net effect is poster -> claimer.
export async function payoutBounty(params: {
  taskId: string;
  bountyMicroUsd: bigint;
  claimerAddress: string;
  description: string;
}): Promise<PayoutOutcome> {
  const simulated = !config.x402Enforce;
  const claimer = params.claimerAddress.toLowerCase();

  if (simulated) {
    await db.transaction.create({
      data: {
        walletAddress: claimer,
        kind: "earning",
        deltaMicroUsd: params.bountyMicroUsd,
        grossMicroUsd: params.bountyMicroUsd,
        description: params.description,
        refType: "task",
        refId: params.taskId,
        status: "simulated",
      },
    });
    return {
      ok: true,
      txHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      blockNumber: 0,
      status: "simulated",
    };
  }

  let txHash: string;
  let blockNumber: number;
  try {
    const result = await treasuryTransfer(claimer, params.bountyMicroUsd);
    txHash = result.txHash;
    blockNumber = result.blockNumber;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Log a failed earning row so the claimer sees the attempt. Bounty
    // remains in treasury (debited from poster); a retry or manual refund
    // is the recovery path.
    await db.transaction.create({
      data: {
        walletAddress: claimer,
        kind: "earning",
        deltaMicroUsd: params.bountyMicroUsd,
        grossMicroUsd: params.bountyMicroUsd,
        description: `${params.description} (chain failed: ${message.slice(0, 80)})`,
        refType: "task",
        refId: params.taskId,
        status: "failed",
      },
    });
    return { ok: false, kind: "chain_error", message };
  }

  await db.transaction.create({
    data: {
      walletAddress: claimer,
      kind: "earning",
      deltaMicroUsd: params.bountyMicroUsd,
      grossMicroUsd: params.bountyMicroUsd,
      description: params.description,
      refType: "task",
      refId: params.taskId,
      txHash,
      blockNumber,
      status: "confirmed",
    },
  });
  return { ok: true, txHash, blockNumber, status: "confirmed" };
}

// Credits the poster's balance back + logs a refund row. No chain tx —
// the escrow never left the treasury.
export async function refundBounty(params: {
  taskId: string;
  bountyMicroUsd: bigint;
  posterAddress: string;
  description: string;
}): Promise<{ ok: true; transactionId: string }> {
  const wallet = params.posterAddress.toLowerCase();
  const [, row] = await db.$transaction([
    db.userProfile.update({
      where: { walletAddress: wallet },
      data: { balanceMicroUsd: { increment: params.bountyMicroUsd } },
    }),
    db.transaction.create({
      data: {
        walletAddress: wallet,
        kind: "refund",
        deltaMicroUsd: params.bountyMicroUsd,
        grossMicroUsd: params.bountyMicroUsd,
        description: params.description,
        refType: "task",
        refId: params.taskId,
        status: "confirmed",
      },
    }),
  ]);
  return { ok: true, transactionId: row.id };
}
