/**
 * Phase 1 smoke test — exercises the full x402 verify + settle lifecycle
 * against the /api/x402-demo route.
 *
 * Usage:
 *   1. Generate or pick a test private key (throwaway; will hold a few
 *      cents of USDC for signing). Export SWARM_TEST_PRIVATE_KEY=0x…
 *      (or omit to generate a fresh one each run — address is printed so
 *      you can fund it).
 *   2. Fund the printed address with ≥ $0.01 USDC on Fuji. Circle faucet:
 *      https://faucet.circle.com/
 *   3. Start `npm run dev` in another terminal on port 3123.
 *   4. Run this script: `npx tsx scripts/x402-smoke.ts`
 *
 * Expected output: script prints the 402 envelope, signs, retries, and
 * prints the 200 response including the Fuji settlement tx hash.
 *
 * Delete after Phase 2 ships (the MCP client exercises the same path
 * naturally against /api/guidance).
 */

import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { x402Client } from "@x402/core/client";
import { createPublicClient, createWalletClient, http, publicActions } from "viem";
import { avalancheFuji } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const TARGET = process.env.X402_DEMO_URL || "http://localhost:3123/api/x402-demo";

async function main() {
  const pk = (process.env.SWARM_TEST_PRIVATE_KEY as `0x${string}` | undefined) || generatePrivateKey();
  const account = privateKeyToAccount(pk);

  console.log("\nx402 smoke test");
  console.log(`  signer: ${account.address}`);
  console.log(`  target: ${TARGET}`);
  console.log();

  if (!process.env.SWARM_TEST_PRIVATE_KEY) {
    console.log("  note: no SWARM_TEST_PRIVATE_KEY set — generated a fresh key.");
    console.log("        fund the address above with USDC on Fuji, then re-run");
    console.log(`        with SWARM_TEST_PRIVATE_KEY=${pk} to reuse.`);
    console.log();
  }

  const walletClient = createWalletClient({
    account,
    chain: avalancheFuji,
    transport: http(),
  }).extend(publicActions);

  const publicClient = createPublicClient({
    chain: avalancheFuji,
    transport: http(),
  });

  const scheme = new ExactEvmScheme(
    toClientEvmSigner(account, publicClient),
  );

  const client = new x402Client().register("eip155:43113", scheme);
  const fetchWithPay = wrapFetchWithPayment(fetch, client);

  // First: bare request to confirm the 402 envelope shape from the server.
  console.log("  → bare GET (no X-PAYMENT)…");
  const bare = await fetch(TARGET);
  console.log(`  ← ${bare.status} ${bare.statusText}`);
  console.log(`    PAYMENT-REQUIRED header: ${bare.headers.get("payment-required")?.slice(0, 80)}…`);
  await bare.text();

  console.log();
  console.log("  → wrapped fetchWithPay (will sign + retry)…");
  const res = await fetchWithPay(TARGET);

  console.log(`  ← ${res.status} ${res.statusText}`);
  const body = await res.json();
  console.log(`  body: ${JSON.stringify(body, null, 2)}`);

  const settleHeader = res.headers.get("x-payment-response");
  if (settleHeader) {
    console.log(`  X-PAYMENT-RESPONSE: ${settleHeader.slice(0, 60)}…`);
  }

  if (res.status === 200) {
    console.log("\n  ✓ x402 verify + settle round-trip succeeded");
    console.log(`  tx: https://testnet.snowtrace.io/tx/${body.settlementTxHash}`);
  } else {
    console.log("\n  ✗ round-trip did NOT complete — see body above for error");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
