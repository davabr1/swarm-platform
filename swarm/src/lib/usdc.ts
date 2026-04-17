import "server-only";
import { ethers } from "ethers";
import { config } from "./config";

// Minimal USDC ABI fragment. We only need three calls:
//   transferFrom(payer, payTo, amount)  — orchestrator pulls on pre-approved allowance
//   allowance(owner, spender)           — read how much headroom a payer has
//   balanceOf(owner)                    — discriminate "allowance exhausted" vs "insufficient balance"
const USDC_ABI = [
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
] as const;

let readProvider: ethers.JsonRpcProvider | null = null;
function provider(): ethers.JsonRpcProvider {
  if (!readProvider) readProvider = new ethers.JsonRpcProvider(config.rpc);
  return readProvider;
}

let orchSigner: ethers.Wallet | null = null;
function orchestratorSigner(): ethers.Wallet {
  if (!orchSigner) {
    if (!config.orchestrator.privateKey) {
      throw new Error("ORCHESTRATOR_PRIVATE_KEY missing — cannot settle USDC transfers");
    }
    orchSigner = new ethers.Wallet(config.orchestrator.privateKey, provider());
  }
  return orchSigner;
}

function usdcRead() {
  return new ethers.Contract(config.usdcContract, USDC_ABI, provider());
}

function usdcWrite() {
  return new ethers.Contract(config.usdcContract, USDC_ABI, orchestratorSigner());
}

export async function allowance(owner: string, spender?: string): Promise<bigint> {
  const sp = spender ?? config.orchestrator.address;
  return (await usdcRead().allowance(owner, sp)) as bigint;
}

export async function balanceOf(owner: string): Promise<bigint> {
  return (await usdcRead().balanceOf(owner)) as bigint;
}

export interface TransferFromResult {
  txHash: string;
  blockNumber: number;
}

// Signs + broadcasts USDC.transferFrom from the orchestrator. Throws on
// revert — caller is expected to catch + classify via `classifyTransferError`.
export async function transferFrom(
  from: string,
  to: string,
  microUsdc: bigint,
): Promise<TransferFromResult> {
  const tx = await usdcWrite().transferFrom(from, to, microUsdc);
  const receipt = await tx.wait();
  return {
    txHash: tx.hash as string,
    blockNumber: Number(receipt?.blockNumber ?? 0),
  };
}

export type TransferFailure =
  | { kind: "allowance_exhausted"; message: string }
  | { kind: "insufficient_balance"; message: string }
  | { kind: "rpc_error"; message: string }
  | { kind: "other"; message: string };

// Classifies a thrown error from `transferFrom` into a structured failure
// so the route can decide whether to 402 the caller (payer-side problem) or
// 500 (orchestrator/RPC problem).
export function classifyTransferError(err: unknown): TransferFailure {
  const anyErr = err as { reason?: string; shortMessage?: string; message?: string } | undefined;
  const raw = anyErr?.reason || anyErr?.shortMessage || anyErr?.message || String(err ?? "");
  const lower = raw.toLowerCase();
  if (lower.includes("insufficient allowance")) {
    return { kind: "allowance_exhausted", message: raw };
  }
  if (lower.includes("transfer amount exceeds balance") || lower.includes("insufficient balance")) {
    return { kind: "insufficient_balance", message: raw };
  }
  if (lower.includes("network") || lower.includes("timeout") || lower.includes("connect")) {
    return { kind: "rpc_error", message: raw };
  }
  return { kind: "other", message: raw };
}
