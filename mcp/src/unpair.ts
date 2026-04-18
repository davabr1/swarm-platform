/**
 * Interactive unpair CLI. Deletes ~/.swarm-mcp/session.json so the next
 * `pair` run mints a fresh keypair.
 *
 * The private key was the only thing holding custody of this MCP's USDC,
 * so losing the file without first sweeping the balance means those funds
 * are unreachable. We print the current balance and a sweep reminder
 * before nuking the file.
 */

import { clearKey, peekSavedKey, usdcBalance } from "./session.js";

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

  console.log(`  ✓ Unpaired ${formatAddress(saved.address)} — session.json deleted.`);
  console.log("");
  console.log("  Note: deleting the local key does NOT revoke the on-chain");
  console.log("  MCPRegistry link. If you want the MCP off your /profile,");
  console.log("  visit the Swarm site and click [ unlink ] next to it.");
  console.log("  Leftover USDC at the address is still yours — sweep it by");
  console.log("  importing the private key shown above into any wallet.");
  console.log("");
  console.log("  Mint a new MCP wallet with:");
  console.log("    npx -y swarm-marketplace-mcp pair");
  console.log("");
  console.log("  If Claude Code / Cursor / Codex is open, fully quit and");
  console.log("  relaunch after pairing — these clients load the key on startup.");
  console.log("");
  return 0;
}
