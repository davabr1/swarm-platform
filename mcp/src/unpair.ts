/**
 * Interactive unpair CLI.
 *
 * Does up to three things, in order, each dynamically gated on live on-chain
 * state rather than blind static warnings:
 *
 *   1. If the MCP holds USDC, ask the user: [1] sweep to main wallet,
 *      [2] keep USDC here and print the private key, [3] cancel. Option 1
 *      runs the ERC-20 transfer inline — no need to run the sweep command
 *      separately.
 *   2. Delete ~/.swarm-mcp/session.json.
 *   3. If the MCPRegistry on Fuji still links this MCP to a main wallet,
 *      print the on-chain unlink instructions. If it's already unlinked,
 *      say so instead of nagging.
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
} from "viem";
import { avalancheFuji } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

import { clearKey, peekSavedKey, swarmApiUrl, usdcBalance } from "./session.js";

const BAR = "━".repeat(64);

// Production MCPRegistry on Fuji. Users running the published `npx` binary
// don't set env vars; the live address is baked in. Overridable for local dev.
const MCP_REGISTRY = (process.env.MCP_REGISTRY_ADDRESS ??
  "0x5e6c3290fb63651413a3542f371c42b3b4aebd68") as `0x${string}`;
const FUJI_RPC =
  process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const USDC_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
]);

const REGISTRY_ABI = parseAbi([
  "function ownerOf(address mcp) view returns (address)",
]);

function formatUsd(micro: bigint): string {
  const whole = Number(micro) / 1_000_000;
  return whole < 1 ? whole.toFixed(3) : whole.toFixed(2);
}

function formatAddress(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

// Returns the paired owner's address, or null when the MCP is unregistered
// on-chain (or the RPC call fails — treat as "unknown" and let the user see
// a softer footer rather than erroring out).
async function fetchOnChainOwner(
  mcp: `0x${string}`,
): Promise<`0x${string}` | null> {
  const pc = createPublicClient({
    chain: avalancheFuji,
    transport: http(FUJI_RPC),
  });
  try {
    const owner = (await pc.readContract({
      address: MCP_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "ownerOf",
      args: [mcp],
    })) as `0x${string}`;
    if (owner.toLowerCase() === ZERO_ADDRESS) return null;
    return owner;
  } catch {
    return null;
  }
}

// Inline sweep used by Option 1. Broadcasts a single ERC-20 transfer from
// the MCP key to the destination, waits for the receipt, returns the result.
async function sweepInline(
  privateKey: `0x${string}`,
  destination: `0x${string}`,
): Promise<
  | { ok: true; txHash: `0x${string}`; amount: bigint }
  | { ok: false; message: string }
> {
  const pc = createPublicClient({
    chain: avalancheFuji,
    transport: http(FUJI_RPC),
  });
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({
    account,
    chain: avalancheFuji,
    transport: http(FUJI_RPC),
  });

  let balance: bigint;
  try {
    balance = (await pc.readContract({
      address: USDC_FUJI,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [account.address],
    })) as bigint;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `could not read USDC balance (${msg})` };
  }

  if (balance === BigInt(0)) {
    return {
      ok: false,
      message: "balance dropped to 0 between the prompt and the sweep — rerun",
    };
  }

  try {
    const txHash = await wallet.writeContract({
      address: USDC_FUJI,
      abi: USDC_ABI,
      functionName: "transfer",
      args: [destination, balance],
    });
    await pc.waitForTransactionReceipt({ hash: txHash });
    return { ok: true, txHash, amount: balance };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg };
  }
}

export async function runInteractiveUnpair(): Promise<number> {
  const saved = await peekSavedKey();

  console.log("");
  console.log(BAR);
  console.log(" Swarm MCP · unpair");
  console.log(BAR);
  console.log("");

  if (!saved) {
    // No local key means we have nothing to delete. We still surface the
    // on-chain-unlink reminder because a user may have deleted session.json
    // by hand without ever running unregister.
    console.log("  No local session.json — nothing to delete locally.");
    console.log("");
    console.log("  If you paired this machine at some point and never ran");
    console.log("  MCPRegistry.unregister, the on-chain link is still live.");
    console.log(`  Check ${swarmApiUrl()}/profile to see any dangling pairings.`);
    console.log("");
    return 0;
  }

  const [balanceRaw, onChainOwner] = await Promise.all([
    usdcBalance(saved.address),
    fetchOnChainOwner(saved.address),
  ]);
  const balance = balanceRaw ?? BigInt(0);
  const balanceKnown = balanceRaw !== null;
  const stillLinkedOnChain = onChainOwner !== null;

  console.log(`  MCP wallet:  ${saved.address}`);
  console.log(
    `  USDC:        ${balanceKnown ? "$" + formatUsd(balance) + " USDC" : "— (RPC unavailable)"}`,
  );
  if (stillLinkedOnChain) {
    console.log(`  Paired to:   ${onChainOwner} (on-chain)`);
  } else {
    console.log("  On-chain:    already unlinked from MCPRegistry");
  }
  console.log("");

  const rl = createInterface({ input, output });

  try {
    if (balance > BigInt(0)) {
      console.log("  This MCP still holds USDC. What do you want to do?");
      console.log("");
      console.log(
        stillLinkedOnChain
          ? `    [1] Sweep $${formatUsd(balance)} to your main wallet (${formatAddress(onChainOwner!)})`
          : `    [1] Sweep $${formatUsd(balance)} to a destination address you'll provide`,
      );
      console.log("    [2] Keep the USDC here — print the private key so I can import it later");
      console.log("    [3] Cancel");
      console.log("");

      const choice = (await rl.question("  Choice [1/2/3]: ")).trim();
      console.log("");

      if (choice === "3" || choice === "") {
        console.log("  Cancelled. session.json untouched.");
        console.log("");
        return 0;
      }

      if (choice === "1") {
        let destination: `0x${string}`;
        if (stillLinkedOnChain) {
          destination = onChainOwner!;
        } else {
          const typed = (
            await rl.question("  Destination address (0x...): ")
          ).trim();
          if (!/^0x[a-fA-F0-9]{40}$/.test(typed)) {
            console.log("  Invalid address. Aborting — session.json untouched.");
            console.log("");
            return 1;
          }
          destination = typed as `0x${string}`;
        }

        console.log(
          `  Sweeping $${formatUsd(balance)} USDC → ${formatAddress(destination)}…`,
        );
        const result = await sweepInline(saved.privateKey, destination);
        if (!result.ok) {
          console.log(`  ⚠ Sweep failed: ${result.message}`);
          console.log("");
          console.log("  Common causes:");
          console.log("    · MCP has 0 AVAX for gas — open /profile in the browser");
          console.log("      once; the site auto-drips ~0.003 AVAX to paired MCPs.");
          console.log("    · Fuji RPC flaky — wait a few seconds and rerun.");
          console.log("");
          console.log("  Aborting — session.json untouched so you can retry.");
          console.log("");
          return 1;
        }
        console.log(
          `  ✓ Swept $${formatUsd(result.amount)} USDC. tx: ${result.txHash}`,
        );
        console.log(
          `    https://testnet.snowtrace.io/tx/${result.txHash}`,
        );
        console.log("");
      } else if (choice === "2") {
        console.log("  Keeping USDC on this MCP address. Save these — they are");
        console.log("  the only way back to the funds once session.json is gone:");
        console.log("");
        console.log(`    Address:     ${saved.address}`);
        console.log(`    Private key: ${saved.privateKey}`);
        console.log("");
        console.log("  Import the private key into MetaMask / Core / Rabby to");
        console.log("  sign transfers from this wallet later.");
        console.log("");
        const confirm = (
          await rl.question("  Saved them? Continue with unpair? [y/N]: ")
        )
          .trim()
          .toLowerCase();
        if (confirm !== "y" && confirm !== "yes") {
          console.log("  Cancelled. session.json untouched.");
          console.log("");
          return 0;
        }
      } else {
        console.log("  Unrecognized choice. Aborting — session.json untouched.");
        console.log("");
        return 1;
      }
    } else if (!balanceKnown) {
      // Couldn't read the balance; make the user explicitly accept the risk.
      console.log("  Could not read USDC balance from Fuji RPC. Proceeding");
      console.log("  would delete the private key even if a balance exists.");
      console.log("");
      const confirm = (
        await rl.question("  Continue anyway? [y/N]: ")
      )
        .trim()
        .toLowerCase();
      if (confirm !== "y" && confirm !== "yes") {
        console.log("  Cancelled. session.json untouched.");
        console.log("");
        return 0;
      }
    }
  } finally {
    rl.close();
  }

  await clearKey();

  console.log(`  ✓ Local session.json deleted (${formatAddress(saved.address)}).`);
  console.log("");

  if (stillLinkedOnChain) {
    console.log(BAR);
    console.log(" ⚠  One more step — unlink on-chain");
    console.log(BAR);
    console.log("");
    console.log("  The MCPRegistry on Fuji still links this MCP to");
    console.log(`  ${onChainOwner}.`);
    console.log("  Until you sign MCPRegistry.unregister from that wallet,");
    console.log("  this MCP keeps showing on /profile and in the nav balance.");
    console.log("");
    console.log(`  → Open ${swarmApiUrl()}/profile, connect the main wallet,`);
    console.log("    and click [ unlink ] next to this MCP.");
    console.log("");
    console.log("  Or use the inline unlink on");
    console.log(`  ${swarmApiUrl()}/configure under "how do I unpair".`);
    console.log("");
    console.log("  The CLI can't do this for you — it doesn't hold your");
    console.log("  main-wallet key.");
    console.log("");
  } else {
    console.log("  On-chain MCPRegistry link was already cleared. You're");
    console.log("  fully unpaired — local key gone, registry entry gone.");
    console.log("  Nothing else to do.");
    console.log("");
  }

  console.log(BAR);
  console.log("");
  console.log("  Mint a fresh MCP wallet any time with:");
  console.log("    npx -y swarm-marketplace-mcp pair");
  console.log("");
  console.log("  If Claude Code / Cursor / Codex is open, fully quit and");
  console.log("  relaunch after pairing — clients load the key on startup.");
  console.log("");
  return 0;
}
