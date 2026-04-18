/**
 * Interactive pairing CLI.
 *
 * Invoked as `npx -y swarm-marketplace-mcp pair`. Unlike the stdio-mode
 * boot path (which Claude Code / Cursor / Codex spawn automatically),
 * this one runs in the user's own terminal: it prints the pair URL,
 * waits for ENTER, opens the browser, polls, and exits with a clear
 * success/failure message. Designed to be the first thing a user runs
 * before adding the MCP to their host.
 */

import { createInterface } from "node:readline";
import {
  generatePairCode,
  pairUrl,
  pollForClaim,
  saveSession,
  swarmApiUrl,
  tryOpenBrowser,
} from "./session.js";

const BAR = "━".repeat(64);

function waitForEnter(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

function formatAddress(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

export async function runInteractivePair(): Promise<number> {
  const code = generatePairCode();
  const url = pairUrl(code);

  console.log("");
  console.log(BAR);
  console.log(" Swarm MCP · one-time wallet pairing");
  console.log("");
  console.log(` URL:   ${url}`);
  console.log(` Code:  ${code}`);
  console.log(` API:   ${swarmApiUrl()}`);
  console.log("");
  console.log(" What happens next:");
  console.log("  1. Press ENTER — your browser opens the pair page.");
  console.log("  2. Connect your wallet (Avalanche Fuji).");
  console.log("  3. Sign one off-chain message (free, no gas) to authorize this MCP session.");
  console.log("     Spend draws from your Swarm deposited balance (top up on /profile).");
  console.log("  4. This terminal will confirm when pairing completes.");
  console.log("");
  console.log(" (Ctrl+C to cancel. If the browser can't auto-open, copy the");
  console.log("  URL above into any browser manually.)");
  console.log(BAR);

  await waitForEnter("\n  > Press ENTER to open the pair page in your browser…");

  console.log("");
  console.log("  Opening browser…");
  tryOpenBrowser(url);

  // Show a simple progress indicator while polling.
  let spinnerStop = false;
  const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frame = 0;
  const start = Date.now();
  const interval = setInterval(() => {
    if (spinnerStop) return;
    const secs = Math.floor((Date.now() - start) / 1000);
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    const label = mins > 0 ? `${mins}m ${s}s` : `${s}s`;
    process.stdout.write(
      `\r  ${spinner[frame]} Waiting for authorization in browser… (${label} elapsed · 10m timeout)`,
    );
    frame = (frame + 1) % spinner.length;
  }, 100);

  let session = null;
  try {
    session = await pollForClaim(code);
  } finally {
    spinnerStop = true;
    clearInterval(interval);
    process.stdout.write("\r" + " ".repeat(80) + "\r");
  }

  if (!session) {
    console.log("");
    console.log("  ✗ Pairing timed out (10 minutes) or the code expired.");
    console.log("    Re-run: npx -y swarm-marketplace-mcp pair");
    console.log("");
    return 1;
  }

  await saveSession(session);

  const expiry = new Date(session.expiresAt);
  const expiryDate = expiry.toISOString().slice(0, 10);
  console.log("");
  console.log("  ✓ Paired!");
  console.log("");
  console.log(`    Wallet:  ${formatAddress(session.address)}`);
  console.log(`    Expires: ${expiryDate}`);
  console.log("");
  console.log("  The session is saved at ~/.swarm-mcp/session.json.");
  console.log("  Now add the MCP to your host:");
  console.log("");
  console.log("    claude mcp add swarm -- npx -y swarm-marketplace-mcp");
  console.log("");
  console.log("  …then restart Claude Code. Tool calls will work immediately.");
  console.log("  Revoke this session later with: npx -y swarm-marketplace-mcp unpair");
  console.log("");
  return 0;
}
