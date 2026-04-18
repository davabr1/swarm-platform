import "server-only";
import { db } from "./db";
import { treasuryTransfer } from "./treasury";
import { config } from "./config";

// Task-bounty lifecycle under x402:
//   post   → poster signs EIP-3009 transferWithAuthorization for the bounty;
//            x402 settles MCP-wallet → platform in one request lifecycle.
//            Handled in /api/tasks POST (no helper here).
//   submit → treasuryTransfer(claimer, bounty). Inbound-only rule means
//            platform → claimer stays treasury-signed.
//   cancel → treasuryTransfer(poster, bounty). Same rationale as submit.
//
// Both submit and cancel write earning/refund Transaction rows for audit.

export type PayoutOutcome =
  | {
      ok: true;
      txHash: string;
      blockNumber: number;
      status: "confirmed" | "simulated";
    }
  | { ok: false; kind: "chain_error"; message: string };

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

export type RefundOutcome =
  | {
      ok: true;
      txHash: string;
      blockNumber: number;
      status: "confirmed" | "simulated";
    }
  | { ok: false; kind: "chain_error"; message: string };

// Reverses an x402 escrow by wiring USDC platform → poster. Treasury-signed
// (outbound), same pattern as payoutBounty.
export async function refundBounty(params: {
  taskId: string;
  bountyMicroUsd: bigint;
  posterAddress: string;
  description: string;
}): Promise<RefundOutcome> {
  const simulated = !config.x402Enforce;
  const poster = params.posterAddress.toLowerCase();

  if (simulated) {
    await db.transaction.create({
      data: {
        walletAddress: poster,
        kind: "refund",
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
    const result = await treasuryTransfer(poster, params.bountyMicroUsd);
    txHash = result.txHash;
    blockNumber = result.blockNumber;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.transaction.create({
      data: {
        walletAddress: poster,
        kind: "refund",
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
      walletAddress: poster,
      kind: "refund",
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
