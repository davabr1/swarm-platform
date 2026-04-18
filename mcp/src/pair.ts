/**
 * Interactive pair CLI. Mints (or loads) the MCP keypair, prints the
 * address + a fund prompt, and optionally waits for the first USDC
 * deposit so the user sees a clean "✓ funded" before exiting.
 *
 * Invoked as `npx -y swarm-marketplace-mcp pair`.
 */

import { getOrCreateKey, peekSavedKey, swarmApiUrl, usdcBalance } from "./session.js";

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
  console.log("  Optional — link this MCP to your profile on swarm.com.");
  console.log("  Open the pair page in your browser and sign one tx with");
  console.log("  your main wallet; the MCP's balance + spend then show up");
  console.log("  under /profile. Skip this and everything still works — it's");
  console.log("  just for tracking.");
  console.log("");
  console.log(`  Pair page:                ${pairUrl}`);
  console.log("");
  console.log(BAR);

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
