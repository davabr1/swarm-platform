import "server-only";
import { ethers } from "ethers";
import { config } from "./config";

// Fuji AVAX drip. The main wallet needs AVAX to sign MCPRegistry pair /
// unpair txs; users often connect with an empty wallet and get blocked.
// Testnet AVAX is free, so the platform treasury tops them up automatically
// when they come in below the threshold.
//
// Size the drip against actual Fuji costs, not optimism. A registry tx runs
// ~60-100k gas × 25 gwei ≈ 0.0025 AVAX; a USDC ERC-20 transfer ≈ 0.0015
// AVAX. 0.005 AVAX covers ~2 on-chain ops comfortably — which is all a
// typical user needs (pair once, unpair once, optional sweep). With a 0.5
// AVAX treasury float that's ~100 fresh users seeded; if they need more,
// the Avalanche Fuji faucet is a click away.
//
// MCP-paired wallets get a smaller drip — they only ever sign ONE tx (the
// sweep back to main wallet) so 0.003 AVAX is plenty. Keeps treasury burn
// per user roughly flat even though we now drip two addresses per user.
const DRIP_THRESHOLD_WEI = ethers.parseEther("0.002");
const DRIP_AMOUNT_WEI = ethers.parseEther("0.005");
const MCP_DRIP_THRESHOLD_WEI = ethers.parseEther("0.001");
const MCP_DRIP_AMOUNT_WEI = ethers.parseEther("0.003");

let readProvider: ethers.JsonRpcProvider | null = null;
function provider(): ethers.JsonRpcProvider {
  if (!readProvider) readProvider = new ethers.JsonRpcProvider(config.rpc);
  return readProvider;
}

let treasurySigner: ethers.Wallet | null = null;
function signer(): ethers.Wallet {
  if (!treasurySigner) {
    if (!config.treasury.privateKey) {
      throw new Error("TREASURY_PRIVATE_KEY missing — required for gas drip");
    }
    treasurySigner = new ethers.Wallet(config.treasury.privateKey, provider());
  }
  return treasurySigner;
}

export interface DripResult {
  dripped: boolean;
  reason?: "already_funded" | "sent" | "treasury_low";
  txHash?: string;
  balanceBefore: string; // wei as decimal string
  balanceAfter?: string;
  amountWei?: string;
}

// Returns the caller's AVAX balance and, if it's below the threshold, sends
// a top-up from the treasury. Idempotent under the threshold — calling
// repeatedly against a funded wallet is a no-op. Pass { kind: "mcp" } for
// paired MCP wallets which only need enough gas for a single sweep tx.
export async function maybeDripAvax(
  to: string,
  opts?: { kind?: "main" | "mcp" },
): Promise<DripResult> {
  if (!ethers.isAddress(to)) {
    throw new Error("invalid address");
  }

  const isMcp = opts?.kind === "mcp";
  const threshold = isMcp ? MCP_DRIP_THRESHOLD_WEI : DRIP_THRESHOLD_WEI;
  const amount = isMcp ? MCP_DRIP_AMOUNT_WEI : DRIP_AMOUNT_WEI;

  const current = await provider().getBalance(to);
  if (current >= threshold) {
    return {
      dripped: false,
      reason: "already_funded",
      balanceBefore: current.toString(),
    };
  }

  // Abort if the treasury can't afford the drip + its own future gas —
  // better to fail loudly at the server than broadcast a tx that reverts.
  // Keep a 0.005 AVAX reserve (enough for the treasury to still sign its
  // own commission fan-out / payout txs) on top of the drip amount itself.
  const treasuryBalance = await provider().getBalance(
    config.treasury.address,
  );
  if (treasuryBalance < amount + ethers.parseEther("0.005")) {
    return {
      dripped: false,
      reason: "treasury_low",
      balanceBefore: current.toString(),
    };
  }

  const tx = await signer().sendTransaction({
    to,
    value: amount,
  });
  await tx.wait();
  const after = await provider().getBalance(to);

  return {
    dripped: true,
    reason: "sent",
    txHash: tx.hash,
    balanceBefore: current.toString(),
    balanceAfter: after.toString(),
    amountWei: amount.toString(),
  };
}
