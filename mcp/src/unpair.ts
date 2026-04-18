/**
 * Interactive unpair CLI.
 *
 * Invoked as `npx -y swarm-marketplace-mcp unpair`. Deletes
 * ~/.swarm-mcp/session.json so the next tool call triggers fresh pairing.
 *
 * This is client-side only — the bearer token stays valid on the server
 * until it expires or is revoked from /profile. For a full revoke the
 * user needs to sign a message in the browser (we can't do that here:
 * the CLI has no access to the wallet's private key).
 */

import { clearSession, peekSavedSession } from "./session.js";

const BAR = "━".repeat(64);

function formatAddress(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

export async function runInteractiveUnpair(): Promise<number> {
  const saved = await peekSavedSession();

  console.log("");
  console.log(BAR);
  console.log(" Swarm MCP · unpair");
  console.log(BAR);
  console.log("");

  if (!saved) {
    console.log("  No paired session found. Nothing to unpair.");
    console.log("");
    console.log("  To pair a wallet:");
    console.log("    npx -y swarm-marketplace-mcp pair");
    console.log("");
    return 0;
  }

  await clearSession();

  console.log(`  ✓ Unpaired ${formatAddress(saved.address)}`);
  console.log("");
  console.log("  The local session file was deleted.");
  console.log("");
  console.log("  To pair a wallet again, run:");
  console.log("    npx -y swarm-marketplace-mcp pair");
  console.log("");
  console.log("  If Claude Code / Cursor / Codex is already open, fully quit");
  console.log("  and relaunch it after you pair — these clients pick up the");
  console.log("  new session only on startup.");
  console.log("");
  console.log("  Note: this does NOT revoke the bearer token on the server —");
  console.log("  it will expire on its own at its scheduled time. For a full");
  console.log("  server-side revoke (e.g. a lost laptop), open /profile in a");
  console.log("  browser, connect the same wallet, and click [ revoke ] next");
  console.log("  to the MCP session.");
  console.log("");
  return 0;
}
