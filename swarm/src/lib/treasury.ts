import "server-only";
import { ethers } from "ethers";
import { config } from "./config";

// Same minimal ABI shape as usdc.ts — we only need transfer + read helpers.
const USDC_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
] as const;

let readProvider: ethers.JsonRpcProvider | null = null;
function provider(): ethers.JsonRpcProvider {
  if (!readProvider) readProvider = new ethers.JsonRpcProvider(config.rpc);
  return readProvider;
}

let treasurySigner: ethers.Wallet | null = null;
function signer(): ethers.Wallet {
  if (!treasurySigner) {
    if (!config.treasury.privateKey) {
      throw new Error(
        "TREASURY_PRIVATE_KEY missing — cannot settle from deposited balance",
      );
    }
    treasurySigner = new ethers.Wallet(config.treasury.privateKey, provider());
  }
  return treasurySigner;
}

function usdcWrite() {
  return new ethers.Contract(config.usdcContract, USDC_ABI, signer());
}

function usdcRead() {
  return new ethers.Contract(config.usdcContract, USDC_ABI, provider());
}

export interface TreasuryTransferResult {
  txHash: string;
  blockNumber: number;
}

// Signs + broadcasts USDC.transfer(to, microUsdc) from the treasury EOA.
// Throws on revert / RPC error — caller classifies and compensates (see
// ledger.ts).
export async function treasuryTransfer(
  to: string,
  microUsdc: bigint,
): Promise<TreasuryTransferResult> {
  if (microUsdc <= BigInt(0)) {
    // Zero-cost settlements are a legitimate edge case (platform agent with
    // negligible Gemini cost that rounds to 0). Treat as a no-op success —
    // no tx is broadcast, no hash returned.
    return { txHash: "0x0", blockNumber: 0 };
  }
  const tx = await usdcWrite().transfer(to, microUsdc);
  const receipt = await tx.wait();
  return {
    txHash: tx.hash as string,
    blockNumber: Number(receipt?.blockNumber ?? 0),
  };
}

export async function treasuryBalance(): Promise<bigint> {
  return (await usdcRead().balanceOf(config.treasury.address)) as bigint;
}
