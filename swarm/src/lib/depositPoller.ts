import "server-only";
import { ethers } from "ethers";
import { config } from "./config";
import { db } from "./db";

// Standard USDC.Transfer(indexed from, indexed to, value) event.
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

let readProvider: ethers.JsonRpcProvider | null = null;
function provider(): ethers.JsonRpcProvider {
  if (!readProvider) readProvider = new ethers.JsonRpcProvider(config.rpc);
  return readProvider;
}

// Encodes an address as a 32-byte topic (left-padded to 64 hex chars). The
// Transfer event indexes `to` as topic[2]; we filter server-side to only
// receive logs for transfers into the treasury.
function addressTopic(addr: string): string {
  return ethers.zeroPadValue(ethers.getAddress(addr), 32);
}

// In-process mutex — prevents two concurrent /api/balance requests from
// hammering the RPC with the same scan window.
let scanInFlight: Promise<ScanResult> | null = null;

export interface ScanResult {
  fromBlock: number;
  toBlock: number;
  newDeposits: Array<{
    txHash: string;
    fromAddress: string;
    microUsd: bigint;
    blockNumber: number;
  }>;
}

// Walk USDC.Transfer(_, treasury) logs from the last scanned block up to
// (head - confirmations). Credits each new deposit inside its own DB
// transaction, then advances the cursor once the whole window is drained.
// Idempotent: Deposit.txHash is the primary key, so a repeat scan is a
// no-op.
export async function runDepositScan(): Promise<ScanResult> {
  if (scanInFlight) return scanInFlight;
  scanInFlight = scanInner().finally(() => {
    scanInFlight = null;
  });
  return scanInFlight;
}

async function scanInner(): Promise<ScanResult> {
  if (!config.treasury.address) {
    // No treasury configured — nothing to scan. Return an empty result so
    // callers don't have to null-check.
    return { fromBlock: 0, toBlock: 0, newDeposits: [] };
  }

  const head = await provider().getBlockNumber();
  const target = Math.max(0, head - config.depositConfirmations);

  const cursor = await db.depositScanCursor.upsert({
    where: { id: "usdc" },
    update: {},
    create: { id: "usdc", lastBlock: target },
  });

  // Fresh install guard: if the cursor is still at 0, fast-forward to the
  // current head minus confirmations. Users transferring from block 0 is
  // impossible on Fuji (USDC was deployed at a known later block), and
  // walking from 0 would take thousands of RPC calls.
  if (cursor.lastBlock === 0) {
    await db.depositScanCursor.update({
      where: { id: "usdc" },
      data: { lastBlock: target },
    });
    return { fromBlock: target, toBlock: target, newDeposits: [] };
  }

  if (cursor.lastBlock >= target) {
    return { fromBlock: cursor.lastBlock, toBlock: cursor.lastBlock, newDeposits: [] };
  }

  const toTopic = addressTopic(config.treasury.address);
  const window = Math.max(1, config.depositScanWindow);
  const newDeposits: ScanResult["newDeposits"] = [];

  let from = cursor.lastBlock + 1;
  while (from <= target) {
    const to = Math.min(from + window - 1, target);
    const logs = await provider().getLogs({
      address: config.usdcContract,
      fromBlock: from,
      toBlock: to,
      topics: [TRANSFER_TOPIC, null, toTopic],
    });
    for (const log of logs) {
      const fromAddr = ethers.getAddress("0x" + log.topics[1].slice(26)).toLowerCase();
      const value = BigInt(log.data);
      if (value <= BigInt(0)) continue;
      const credited = await creditDeposit({
        txHash: log.transactionHash,
        fromAddress: fromAddr,
        microUsd: value,
        blockNumber: log.blockNumber,
      });
      if (credited) newDeposits.push(credited);
    }
    // Advance the cursor incrementally so a crash mid-scan doesn't replay
    // the entire window on next run (duplicate inserts are idempotent, but
    // re-walking blocks we already covered is wasted RPC).
    await db.depositScanCursor.update({
      where: { id: "usdc" },
      data: { lastBlock: to },
    });
    from = to + 1;
  }

  return { fromBlock: cursor.lastBlock + 1, toBlock: target, newDeposits };
}

// Inserts a Deposit + credits the profile balance + writes a Transaction
// ledger row, all in a single DB transaction. Returns the deposit payload
// on success, or null if the txHash was already credited (dedupe).
async function creditDeposit(args: {
  txHash: string;
  fromAddress: string;
  microUsd: bigint;
  blockNumber: number;
}): Promise<ScanResult["newDeposits"][number] | null> {
  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.deposit.findUnique({ where: { txHash: args.txHash } });
      if (existing) return null;

      await tx.userProfile.upsert({
        where: { walletAddress: args.fromAddress },
        update: { balanceMicroUsd: { increment: args.microUsd } },
        create: {
          walletAddress: args.fromAddress,
          balanceMicroUsd: args.microUsd,
        },
      });

      const ledger = await tx.transaction.create({
        data: {
          walletAddress: args.fromAddress,
          kind: "deposit",
          deltaMicroUsd: args.microUsd,
          grossMicroUsd: args.microUsd,
          description: "USDC deposit",
          refType: "deposit",
          txHash: args.txHash,
          blockNumber: args.blockNumber,
          status: "confirmed",
        },
      });

      await tx.deposit.create({
        data: {
          txHash: args.txHash,
          fromAddress: args.fromAddress,
          microUsd: args.microUsd,
          blockNumber: args.blockNumber,
          transactionId: ledger.id,
        },
      });

      return {
        txHash: args.txHash,
        fromAddress: args.fromAddress,
        microUsd: args.microUsd,
        blockNumber: args.blockNumber,
      };
    });
  } catch (err) {
    // A race between two concurrent scans could trip the unique index.
    // Safe to treat as already-credited.
    if (err instanceof Error && /unique|duplicate/i.test(err.message)) return null;
    throw err;
  }
}
