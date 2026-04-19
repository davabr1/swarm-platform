/**
 * Interactive sweep CLI. Sends the MCP wallet's entire USDC balance on Fuji
 * to a destination address — typically the user's main wallet, so they can
 * recover funds before unpairing or just consolidate spend-power.
 *
 * Usage:
 *   npx -y swarm-marketplace-mcp sweep <destination>
 *
 * The MCP's private key never leaves the local machine — this command signs
 * the transfer and broadcasts it directly to the Fuji RPC. No server, no
 * x402, just an ERC-20 transfer.
 */

import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { avalancheFuji } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { peekSavedKey } from "./session.js";

const BAR = "━".repeat(64);
const FUJI_RPC =
  process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65" as const;

const USDC_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
]);

function formatUsd(micro: bigint): string {
  const whole = Number(micro) / 1_000_000;
  return whole < 1 ? whole.toFixed(3) : whole.toFixed(2);
}

function formatAddress(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

function isAddress(s: string): s is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

export async function runInteractiveSweep(dest: string | undefined): Promise<number> {
  console.log("");
  console.log(BAR);
  console.log(" Swarm MCP · sweep USDC");
  console.log(BAR);
  console.log("");

  const saved = await peekSavedKey();
  if (!saved) {
    console.log("  No paired wallet found — nothing to sweep.");
    console.log("");
    console.log("  If you already unpaired but still have the private key,");
    console.log("  import it into MetaMask / Core / Rabby and send USDC out");
    console.log("  from there instead.");
    console.log("");
    return 1;
  }

  if (!dest || !isAddress(dest)) {
    console.log(`  Wallet:  ${saved.address}`);
    console.log("");
    console.log("  Missing or invalid destination address.");
    console.log("");
    console.log("  Usage:");
    console.log("    npx -y swarm-marketplace-mcp sweep <destination-address>");
    console.log("");
    console.log("  Destination is usually your main wallet — the one you");
    console.log("  paired this MCP from.");
    console.log("");
    return 1;
  }

  const pc = createPublicClient({
    chain: avalancheFuji,
    transport: http(FUJI_RPC),
  });

  let balance: bigint;
  try {
    balance = (await pc.readContract({
      address: USDC_FUJI,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [saved.address],
    })) as bigint;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ⚠ Could not read USDC balance (${msg}).`);
    console.log("    Check that Fuji RPC is reachable and try again.");
    console.log("");
    return 1;
  }

  console.log(`  From:    ${saved.address}`);
  console.log(`  To:      ${dest}`);
  console.log(`  Amount:  $${formatUsd(balance)} USDC (entire balance)`);
  console.log("");

  if (balance === BigInt(0)) {
    console.log("  MCP wallet is empty — nothing to sweep. Done.");
    console.log("");
    return 0;
  }

  // Short countdown so the user can Ctrl+C if they typed the wrong address.
  process.stdout.write("  Broadcasting in 3");
  for (let i = 2; i >= 1; i -= 1) {
    await new Promise((r) => setTimeout(r, 1_000));
    process.stdout.write(`…${i}`);
  }
  await new Promise((r) => setTimeout(r, 1_000));
  process.stdout.write("…0\n");

  const account = privateKeyToAccount(saved.privateKey);
  const wallet = createWalletClient({
    account,
    chain: avalancheFuji,
    transport: http(FUJI_RPC),
  });

  let txHash: `0x${string}`;
  try {
    txHash = await wallet.writeContract({
      address: USDC_FUJI,
      abi: USDC_ABI,
      functionName: "transfer",
      args: [dest as `0x${string}`, balance],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("");
    console.log(`  ⚠ Transfer failed: ${msg}`);
    console.log("");
    console.log("  Common causes:");
    console.log("    · MCP wallet has 0 AVAX for gas → fund with a tiny drop");
    console.log("      of AVAX on Fuji (faucet.avax.network), then rerun.");
    console.log("    · Fuji RPC flaky → retry in a few seconds.");
    console.log("");
    return 1;
  }

  console.log("");
  console.log(`  ✓ Submitted: ${txHash}`);
  process.stdout.write("  Waiting for confirmation…");

  try {
    const receipt = await pc.waitForTransactionReceipt({ hash: txHash });
    process.stdout.write(
      receipt.status === "success" ? " confirmed ✓\n" : " reverted ✗\n",
    );
  } catch {
    process.stdout.write(" (timeout — check snowtrace)\n");
  }

  console.log("");
  console.log(
    `  Swept $${formatUsd(balance)} USDC from ${formatAddress(saved.address)} → ${formatAddress(dest)}.`,
  );
  console.log("");
  console.log(`  Snowtrace:  https://testnet.snowtrace.io/tx/${txHash}`);
  console.log("");
  return 0;
}
