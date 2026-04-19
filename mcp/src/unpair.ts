/**
 * Interactive unpair CLI. Deletes ~/.swarm-mcp/session.json so the next
 * `pair` run mints a fresh keypair.
 *
 * The private key was the only thing holding custody of this MCP's USDC,
 * so losing the file without first sweeping the balance means those funds
 * are unreachable. We print the current balance and a sweep reminder
 * before nuking the file.
 */

import { clearKey, peekSavedKey, swarmApiUrl, usdcBalance } from "./session.js";

const BAR = "━".repeat(64);

function formatUsd(micro: bigint): string {
  const whole = Number(micro) / 1_000_000;
  return whole < 1 ? whole.toFixed(3) : whole.toFixed(2);
}

function formatAddress(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

export async function runInteractiveUnpair(): Promise<number> {
  const saved = await peekSavedKey();

  console.log("");
  console.log(BAR);
  console.log(" Swarm MCP · unpair");
  console.log(BAR);
  console.log("");

  if (!saved) {
    console.log("  No paired wallet found. Nothing to unpair.");
    console.log("");
    console.log("  Mint a new MCP wallet with:");
    console.log("    npx -y swarm-marketplace-mcp pair");
    console.log("");
    return 0;
  }

  const bal = await usdcBalance(saved.address);

  console.log(`  Wallet:   ${saved.address}`);
  if (bal !== null && bal > BigInt(0)) {
    console.log(`  Balance:  $${formatUsd(bal)} USDC`);
    console.log("");
    console.log("  ⚠  This address still holds USDC. To recover it, import the");
    console.log("     private key below into a wallet app (MetaMask, Core,");
    console.log("     Rabby) BEFORE continuing, then send USDC out.");
    console.log("");
    console.log(`     Private key: ${saved.privateKey}`);
    console.log("");
    console.log("  Deleting session.json now anyway — re-run this command");
    console.log("  if you want to keep the key. Ctrl+C to cancel.");
    console.log("");
    await new Promise((r) => setTimeout(r, 3_000));
  }

  await clearKey();

  console.log(`  ✓ Local session.json deleted (${formatAddress(saved.address)}).`);
  console.log("");
  console.log(BAR);
  console.log(" ⚠  UNPAIRING UNFINISHED — one more step");
  console.log(BAR);
  console.log("");
  console.log("  The on-chain MCPRegistry link still points at this MCP,");
  console.log("  so the Swarm site and your /profile will keep showing it");
  console.log("  until you unlink from your main wallet.");
  console.log("");
  console.log("  → Open Swarm, connect your main wallet, and click [ unlink ]:");
  console.log(`      ${swarmApiUrl()}/profile`);
  console.log("");
  console.log("  That sends the on-chain `unpair` tx from the wallet that");
  console.log("  owns the pairing — the CLI can't do it for you because it");
  console.log("  doesn't hold your main-wallet key.");
  console.log("");
  console.log(BAR);
  console.log("");
  console.log("  Leftover USDC at the MCP address is still yours — sweep it");
  console.log("  by importing the private key shown above into any wallet.");
  console.log("");
  console.log("  Mint a new MCP wallet with:");
  console.log("    npx -y swarm-marketplace-mcp pair");
  console.log("");
  console.log("  If Claude Code / Cursor / Codex is open, fully quit and");
  console.log("  relaunch after pairing — these clients load the key on startup.");
  console.log("");
  return 0;
}
