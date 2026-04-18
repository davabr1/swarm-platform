# Avalanche wiring — ARCHIVED

> **This document is historical.** It originally described the Phase 0
> allowance flow (`USDC.approve` + `transferFrom`) and was updated to
> describe the Phase 1 treasury-custody + deposited-balance model. **Both
> are retired.** The current architecture is x402-native across the
> board: HTTP `402 Payment Required` → client signs EIP-3009
> `transferWithAuthorization` → facilitator settles USDC on Fuji
> peer-to-peer in ~2 seconds. Treasury is outbound-only (facilitator
> signer, commission fan-out, task payouts). Nothing on this page should
> be used to implement new behavior.

## Where to look instead

**Live architecture docs:**
- `swarm/AGENTS.md` — authoritative summary of the x402 model and the
  retired columns/tables still in the schema for non-destructive migration.
- `X402_MIGRATION.md` (repo root) — context + reasoning behind the
  migration (why x402, why Option A self-custody, why Avalanche-native
  infra on top).
- `swarm/README.md` — quick-start, env vars, deployment.

**Code:**
- `swarm/src/lib/x402.ts` — facilitator selection (`self` vs `uv`) +
  `buildPaymentRequirements()`.
- `swarm/src/lib/x402Middleware.ts` — `requireX402Payment(req, { priceResolver })`
  helper every paid route runs through.
- `swarm/src/lib/selfFacilitator.ts` — in-process `ExactEvmScheme` from
  `@x402/evm`, backed by the treasury wallet.
- `swarm/src/lib/uvFacilitator.ts` — UltraVioleta HTTP facilitator adapter.
- `swarm/src/lib/postSettleFanout.ts` — `recordX402Settlement()` +
  `fanoutSplit()` (commission to creator via `treasuryTransfer`).
- `swarm/src/lib/treasury.ts` — outbound-only EOA signer. Three jobs:
  x402 facilitator signing, commission fan-out, task-claimer payouts.
- `swarm/src/lib/avalanche.ts` — chain constants, RPC URL resolution,
  Snowtrace URL helpers, Glacier client.
- `swarm/src/lib/mcpRegistry.ts` — reader for the on-chain
  `MCPRegistry.sol` (binds MCP addresses to their owner wallets).
- `swarm/contracts/MCPRegistry.sol` + `swarm/scripts/deploy-mcp-registry.ts`
  — Phase 6 contract + one-shot deploy script.

**MCP client side:**
- `mcp/src/session.ts` — secp256k1 keypair at `~/.swarm-mcp/session.json`.
- `mcp/src/pair.ts` — `npx -y swarm-marketplace-mcp pair` mints the key
  and prints the `/pair` URL for on-chain registration.
- `mcp/src/index.ts` — wraps `fetch` with `@x402/fetch::wrapFetchWithPayment`.

## Fuji + sponsor references (still accurate)

- **Chain:** Avalanche Fuji testnet (chainId `43113`, CAIP-2 `eip155:43113`).
- **USDC:** Circle `FiatTokenV2` at `0x5425890298aed601595a70AB815c96711a31Bc65`
  — natively implements EIP-3009 `transferWithAuthorization`.
- **RPC:** set `FUJI_RPC_URL` (AvaCloud recommended). Public fallback:
  `https://api.avax-test.network/ext/bc/C/rpc`.
- **ERC-8004 registries on Fuji:**
  - Identity: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
  - Reputation: `0x8004B663056A597Dffe9eCcC1965A193B7388713`
- **Faucets:** AVAX — https://build.avax.network/console/primary-network/faucet ·
  USDC — https://faucet.circle.com/
- **Explorer:** https://testnet.snowtrace.io
- **x402 Academy (sponsor track):** https://build.avax.network/academy/blockchain/x402-payment-infrastructure
