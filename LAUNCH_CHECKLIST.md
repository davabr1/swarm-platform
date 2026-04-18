# Swarm launch checklist

Everything that has to happen before the hackathon demo, sorted by blast radius. Top items are hard blockers — nothing real works without them. Bottom items are polish or can wait until after the demo.

Under x402 there are **no deposits, no DB-held balances, no autonomous caps, no session cookies** — every paid call is a wallet-signed EIP-3009 `transferWithAuthorization` that settles USDC peer-to-peer on Fuji in ~2 seconds.

---

## 1. Provision the treasury wallet — HARD BLOCKER

The treasury is **outbound-only**. It has three jobs:

1. Sign the in-process x402 facilitator settle (`@x402/evm`'s `ExactEvmScheme`) when a paid route verifies a payment.
2. Sign commission fan-out to agent creators after each paid call (`postSettleFanout.ts`).
3. Sign platform → claimer bounty payouts when a human task is submitted (`taskEscrow.ts::payoutBounty`) and platform → poster refunds on cancel (`refundBounty`).

It **never receives USDC from users** — x402 pays agent wallets directly. The treasury only needs Fuji AVAX for gas.

### Steps

1. **Generate a fresh EOA.** Any of:
   - `cast wallet new` (Foundry)
   - `node -e "console.log(require('ethers').Wallet.createRandom())"` in the `swarm/` dir
   - Any wallet app that can export a private key

   Save the private key + address somewhere secure.

2. **Fund with Fuji AVAX for gas.** Grab from the
   [Avalanche faucet](https://build.avax.network/console/primary-network/faucet).
   Aim for ≥0.5 AVAX so you're not topping up mid-demo.

   No USDC float needed under x402 — the treasury never holds user balances.

3. **Add env vars** to `swarm/.env` (local) **and** Vercel project settings (prod):
   ```
   TREASURY_ADDRESS=0x…
   TREASURY_PRIVATE_KEY=0x…
   ```
   Restart the dev server after editing `.env`.

### Verify

- Triple-click the SWARM logo → `/admin` → enter `ADMIN_PASSWORD` (see step 2). The treasury row shows the address + positive AVAX + current block. If it says "not configured," the env vars didn't load.
- Hit any paid route without an `X-PAYMENT` header (e.g. `curl -i https://<your-domain>/api/guidance -X POST -d '{"agent_id":"linguaBot","question":"hi"}' -H 'content-type: application/json'`) and confirm the response is `402 Payment Required` with a valid `accepts[].payTo` pointing at the treasury (or `PLATFORM_PAYOUT_ADDRESS` if you set one).

---

## 2. Set `ADMIN_PASSWORD`

Gates `/admin` (fan-out health + x402 settlement feed + treasury balance + retry button). Without it, `/admin` returns `503 admin disabled`.

```bash
# pick anything — it's just for you
echo "ADMIN_PASSWORD=pick-a-password-here" >> swarm/.env
```

Add the same value to Vercel env vars for prod.

### Verify

- Triple-click the SWARM logo anywhere in the site → `/admin` → enter the password → data loads (x402 settlements + fan-outs, treasury balance, env sanity).
- Reload `/admin` → password prompt comes back (no session is kept, by design).

---

## 3. Deploy `MCPRegistry.sol` to Fuji

On-chain contract that binds MCP addresses to their owner's main wallet. Without it the `/pair` page and the `PairedMcpsPanel` on `/profile` fall back to a graceful "registry not deployed" state — the site still works end-to-end, but the sponsor-surface contract isn't live.

### Steps

1. Make sure your treasury wallet has Fuji AVAX (the deploy script uses `TREASURY_PRIVATE_KEY`).
2. `cd swarm && npx tsx scripts/deploy-mcp-registry.ts` — one-shot deploy. Prints the deployed address.
3. Set in `swarm/.env` **and** Vercel env vars:
   ```
   NEXT_PUBLIC_MCP_REGISTRY_ADDRESS=0x…
   ```
4. **Verify the source on Snowtrace** → paste the solidity at https://testnet.snowtrace.io/verifyContract — this is the sponsor-visible signal that we shipped a real Fuji contract.

### Verify

- Open `/pair?mcpAddress=0xDEAD…BEEF` with a wallet connected → the "link MCP to my wallet" button renders. (You don't need a real MCP address to sanity-check the page.)
- Run `npx -y swarm-marketplace-mcp pair` on any machine → CLI prints a link that opens `/pair?mcpAddress=<real>` → click "link" → wagmi prompts to sign `MCPRegistry.register(mcpAddress)` → tx confirms → reload `/profile/<your-wallet>` → PairedMcpsPanel shows the MCP with its live USDC balance.

---

## 4. Set `PLATFORM_AGENT_ADDRESS`

Shared wallet that receives USDC on behalf of platform-made agents (LinguaBot, Solmantis, MEV Scope, RegulaNet, and every image agent). Custom user-listed agents receive to their creator's own wallet. This EOA never signs — it just receives.

Can be the same address as the treasury if you want, or any fresh EOA. Never needs to hold AVAX (it never sends anything).

Add to `.env` and Vercel:
```
PLATFORM_AGENT_ADDRESS=0x…
```

### Verify

- Open `/admin` — env-sanity block shows the address.
- Run one paid `swarm_ask_agent` call against a platform agent → Snowtrace shows the `transferWithAuthorization` pays this address.

---

## 5. Wallet connect + Vertex + database

These are quick but non-negotiable.

- **WalletConnect project id** → free at https://cloud.reown.com → set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`. Required for non-injected wallets (Rainbow, Coinbase, mobile QR). Without it, the browser marketplace can still sign via MetaMask but mobile users can't connect.
- **Vertex AI (Gemini 3.1 Pro + Nano Banana 2 Flash)** → service-account-bound API key. Set `GOOGLE_API_KEY`, `GCP_PROJECT_ID`, `GCP_LOCATION`.
- **Supabase Postgres** → set `DATABASE_URL` (pooled, port 6543) and `DIRECT_URL` (session, port 5432). Run `npm run db:migrate:deploy` then `npm run db:seed`.

---

## 6. End-to-end Fuji dry run

Once steps 1–5 are done, do this once start-to-finish. It catches wiring mistakes type checks can't see.

1. Fresh MCP keypair: `npx -y swarm-marketplace-mcp pair` → note the printed MCP address + `/pair` URL.
2. Open the `/pair` URL in a browser, connect your main wallet, click "link MCP to my wallet," sign the `MCPRegistry.register` tx.
3. From a funded wallet send ~5 USDC on Fuji to the MCP address (Circle faucet: https://faucet.circle.com/). CLI prints `✓ Balance: $5.00 USDC`.
4. Wire the MCP into Claude Desktop / Cursor / Codex — copy the config from `/connect`.
5. In your client: `swarm_list_agents` (free, works without payment).
6. `swarm_ask_agent` against a platform agent (e.g. LinguaBot) → server returns `402` → MCP signs EIP-3009 → x402 settles → answer comes back. Verify on Snowtrace: (a) `transferWithAuthorization` MCP → platform, (b) commission fan-out platform → creator wallet (only for user-created agents).
7. `swarm_follow_up` five times against the same conversation — each should produce a separate on-chain settle.
8. `swarm_generate_image` against `lumen` → image returned, `breakdown` populated, two on-chain txs visible.
9. `swarm_post_human_task` with a 0.10 USDC bounty → note the task id → visit `/tasks` in a browser → claim from a second wallet → submit → treasury payout to claimer (Snowtrace). Rate via `swarm_rate_human_task` → ERC-8004 feedback tx fires.
10. Post a second task → click cancel on the tasks board → wallet signs the cancel message → treasury refunds the poster (Snowtrace).
11. `/profile/<owner-wallet>` shows the paired MCP, the MCP's live USDC balance, and a unified transaction feed including spend from the MCP address.

If any step fails, **do not demo** — file a bug in a scratchpad and fix it first.

---

## 7. Publish the MCP package

Once the site is confirmed working end-to-end, publish so `npx -y swarm-marketplace-mcp` resolves to the latest:

```bash
cd mcp
npm publish
```

Version is already `0.10.0` in `mcp/package.json`. Requires npm login.

---

## Optional: Avalanche-native infra upgrades

These swap the out-of-box RPC + indexer for dedicated Avalanche services. Good for sponsor signal; not blockers.

- **AvaCloud RPC** (highly recommended) → set `FUJI_RPC_URL=<your-avacloud-endpoint>`. The public Fuji RPC rate-limits hard under demo load.
- **UltraVioleta x402 facilitator** → set `X402_FACILITATOR=uv` + `FACILITATOR_URL=https://facilitator.ultravioletadao.xyz`. Default is `self` (in-process via `@x402/evm`) which has no external dependency and is easier to demo.

---

## Explicitly deferred (not shipping for hackathon)

Ack'd already — do NOT let scope creep pull these in before the demo:

- **Batch commission payouts.** Each paid call currently does two on-chain txs (x402 settle + commission fan-out). Cheap on Fuji, expensive at scale. Batching is the eventual fix.
- **Treasury → multisig or vault.** A single env-held key secures the facilitator signer today. Fine for hackathon, not for prod.
- **Destructive schema migration** — the deprecated columns (`UserProfile.{balanceMicroUsd, autonomousCapUsd, autonomousSpentMicroUsd, autoTopup}`, `Deposit`, `DepositScanCursor`) and legacy tables are retained unread for a clean post-demo cleanup.
- **Retry queue for ERC-8004 rating writes.** Today they silent-fail if Fuji RPC hiccups; logged but not re-queued.

---

## Quick reference — env vars that must be set

Grouped by concern. See `swarm/.env.example` for the full annotated list.

**Required — x402 + admin**
| Var | Where | Purpose |
|---|---|---|
| `TREASURY_ADDRESS` | `.env` + Vercel | Treasury EOA (facilitator signer + outbound fan-out) |
| `TREASURY_PRIVATE_KEY` | `.env` + Vercel | Signs x402 settle + fan-out + task payouts |
| `ADMIN_PASSWORD` | `.env` + Vercel | Gates `/admin` dashboard |
| `PLATFORM_AGENT_ADDRESS` | `.env` + Vercel | Receives USDC for platform-made agents |
| `NEXT_PUBLIC_MCP_REGISTRY_ADDRESS` | `.env` + Vercel | On-chain MCP ↔ wallet binding (after step 3) |

**Required — infra**
| Var | Where | Purpose |
|---|---|---|
| `ORCHESTRATOR_PRIVATE_KEY` / `ORCHESTRATOR_ADDRESS` | `.env` + Vercel | Conductor signer when the site hires agents |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | `.env` + Vercel | Non-injected wallets |
| `GOOGLE_API_KEY`, `GCP_PROJECT_ID`, `GCP_LOCATION` | `.env` + Vercel | Vertex AI / Gemini |
| `DATABASE_URL`, `DIRECT_URL` | `.env` + Vercel | Supabase pooled + session |
| `FUJI_RPC_URL` | `.env` + Vercel | Dedicated Fuji RPC (AvaCloud recommended) |

**Optional**
| Var | Default | Purpose |
|---|---|---|
| `X402_FACILITATOR` | `self` | `uv` to use UltraVioleta's HTTP facilitator |
| `FACILITATOR_URL` | n/a | Only used when `X402_FACILITATOR=uv` |
| `PLATFORM_PAYOUT_ADDRESS` | `TREASURY_ADDRESS` | x402 `payTo` override |
| `X402_ENFORCE` | `true` | Set to `false` to simulate settles locally |
| `X402_DEBUG` | unset | Set to `1` to log verify/settle payloads |
