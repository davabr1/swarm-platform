/**
 * Interactive pair CLI. Mints (or loads) the MCP keypair, prints the
 * address + a fund prompt, and optionally waits for the first USDC
 * deposit so the user sees a clean "✓ funded" before exiting.
 *
 * Invoked as `npx -y swarm-marketplace-mcp pair`.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";

import { getOrCreateKey, peekSavedKey, swarmApiUrl, usdcBalance } from "./session.js";

function openInBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Silent — the URL is already printed; user can copy/paste.
  }
}

// Wait for the user to press Enter. Returns true if they consented to open
// the browser, false if stdin isn't a TTY (scripted / piped invocation —
// skip the prompt and don't auto-open).
async function promptToOpenBrowser(): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question(
      "  Press Enter to open the pair page in your browser (or s + Enter to skip) › ",
    );
    return answer.trim().toLowerCase() !== "s";
  } finally {
    rl.close();
  }
}

const BAR = "━".repeat(64);

function formatUsd(micro: bigint): string {
  const whole = Number(micro) / 1_000_000;
  return whole < 1 ? whole.toFixed(3) : whole.toFixed(2);
}

function formatAddress(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

export async function runInteractivePair(): Promise<number> {
  const existed = await peekSavedKey();
  const key = await getOrCreateKey();
  const fresh = !existed;

  const pairUrl = `${swarmApiUrl()}/pair?mcpAddress=${key.address}`;

  console.log("");
  console.log(BAR);
  console.log(" Swarm MCP · x402 pairing");
  console.log(BAR);
  console.log("");
  console.log(
    fresh
      ? "  ✓ Generated a new wallet for this MCP."
      : "  ✓ Loaded existing MCP wallet.",
  );
  console.log("");
  console.log(`    Address:  ${key.address}`);
  console.log(`    Network:  Avalanche Fuji (eip155:43113)`);
  console.log(`    Asset:    USDC (0x5425…Bc65)`);
  console.log(`    Stored:   ~/.swarm-mcp/session.json (mode 0600)`);
  console.log("");
  console.log("  Fund this address with USDC on Fuji to start paying for");
  console.log("  agents. Every paid tool call signs an EIP-3009 transfer");
  console.log("  authorization with this key; USDC moves peer-to-peer via");
  console.log("  x402 in ~2 seconds. No gas for you.");
  console.log("");
  console.log("  Circle Fuji USDC faucet:  https://faucet.circle.com/");
  console.log("");
  console.log("  Next: register this MCP on-chain so your profile shows");
  console.log("  its balance + spend. Opening the pair page in your browser");
  console.log("  now — sign one tx from your main wallet and you're done.");
  console.log("");
  console.log(`  Pair page:                ${pairUrl}`);
  console.log("");
  console.log(BAR);
  console.log("");

  const shouldOpen = await promptToOpenBrowser();
  if (shouldOpen) {
    openInBrowser(pairUrl);
    console.log("");
    console.log("  Opening browser…");
  } else {
    console.log("");
    console.log("  Skipped — open the URL above in your browser when ready.");
  }

  // Best-effort: poll for the first USDC transfer so the user sees a clean
  // "funded" signal. Skipped if the RPC is unreachable. Runs up to 90s so
  // the CLI doesn't feel stuck forever.
  const bal = await usdcBalance(key.address);
  if (bal === null) {
    console.log("");
    console.log("  (USDC balance check unavailable — Fuji RPC unreachable.)");
    console.log("  Fund the address above, then add the MCP to your host:");
    console.log("");
    console.log("    claude mcp add swarm -- npx -y swarm-marketplace-mcp");
    console.log("");
    return 0;
  }

  if (bal > BigInt(0)) {
    console.log("");
    console.log(`  ✓ Balance:  $${formatUsd(bal)} USDC — ready to spend.`);
    console.log("");
    console.log("  Add the MCP to your host:");
    console.log("    claude mcp add swarm -- npx -y swarm-marketplace-mcp");
    console.log("");
    return 0;
  }

  console.log("");
  process.stdout.write("  Waiting for first USDC transfer (90s timeout, Ctrl+C to skip)…");

  const deadline = Date.now() + 90_000;
  let funded: bigint | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3_000));
    process.stdout.write(".");
    const next = await usdcBalance(key.address);
    if (next !== null && next > BigInt(0)) {
      funded = next;
      break;
    }
  }
  process.stdout.write("\n");

  if (funded) {
    console.log("");
    console.log(`  ✓ Funded!  $${formatUsd(funded)} USDC detected at ${formatAddress(key.address)}.`);
  } else {
    console.log("");
    console.log("  ⏳ No USDC detected yet — the MCP still works, it just can't pay");
    console.log("     for anything until you fund the address above.");
  }

  console.log("");
  console.log("  Add the MCP to your host:");
  console.log("    claude mcp add swarm -- npx -y swarm-marketplace-mcp");
  console.log("");
  console.log("  Unpair later with:  npx -y swarm-marketplace-mcp unpair");
  console.log("");
  return 0;
}
