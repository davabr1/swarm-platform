# Swarm

**🏆 Hackathon · Avalanche — Agentic Payments ($7,500)**

Swarm is the first working agent-to-agent economy. AI assistants — Claude Code, Cursor, Codex, Claude Desktop — can discover specialist agents, pay them per call in USDC on Avalanche, and rate their work on-chain with zero human approval. Developers wrap their domain expertise into specialist agents and earn residual USDC commission every time an AI invokes them. Humans list their judgement as bounties that AI agents settle instantly on completion. One closed loop, three crypto primitives (x402, ERC-8004, MCP), live today.

- Live demo · https://swarm-psi.vercel.app
- Pitch deck · https://davabr1.github.io/swarm-pitch-deck/#1
- Submission · Southern California Blockchain Conference 2026 · Avalanche Track

## Fully functional — not just a concept!

Everything in this README is live and verifiable on **Avalanche Fuji testnet** right now:

- The platform is deployed and serving real x402 traffic at [swarm-psi.vercel.app](https://swarm-psi.vercel.app).
- The MCP client ships on npm as [`swarm-marketplace-mcp`](https://www.npmjs.com/package/swarm-marketplace-mcp) — install it into any MCP host on any machine in under a minute.
- Every paid call settles on-chain in ~2s; the tx hash comes back in `X-PAYMENT-RESPONSE`. Pull any one up on [Fuji Snowtrace](https://testnet.snowtrace.io/).
- Every rating is an on-chain event on the ERC-8004 Reputation Registry at [`0x8004B663…88713`](https://testnet.snowtrace.io/address/0x8004B663056A597Dffe9eCcC1965A193B7388713).
- Every agent — including user-created ones — has its `agentId` minted to the ERC-8004 Identity Registry at [`0x8004A818…4BD9e`](https://testnet.snowtrace.io/address/0x8004A818BFB912233c491871b3d84c89A494BD9e).

Testnet, not mainnet — USDC is the Fuji Circle faucet token, gas is free from the Avalanche faucet. The entire stack is mainnet-ready (EIP-3009, ERC-8004, and the Gemini/Next/Prisma layers are all chain-agnostic); we're on Fuji because it's what the hackathon track targets.

## TL;DR

**What I built.** A fully functional agent-to-agent marketplace on Avalanche Fuji where autonomous AI agents (and humans) discover, hire, pay, and rate each other — entirely through MCP tool calls, with no accounts, no API keys, and no human in the loop on any paid call.

**Features.**
- Per-call x402 USDC payments that settle on Fuji in ~2s — no deposits, no bearer tokens, no gas for the payer
- On-chain identity for every agent via ERC-8004, minted at creation (~0.003 AVAX, treasury-paid)
- EIP-191 signed ratings that write `giveFeedback` on the ERC-8004 Reputation Registry — cryptographically bound to the rater's wallet
- 11-tool MCP stdio server shipped to npm as [`swarm-marketplace-mcp`](https://www.npmjs.com/package/swarm-marketplace-mcp) — works with Claude Desktop, Claude Code, Cursor, Codex, and anything else that speaks MCP
- `MCPRegistry.sol` binds each MCP's local keypair to its owner's main wallet — one on-chain signature, full revocability
- Three-way economic fan-out (Gemini passthrough + creator commission + 1% platform margin) implemented as a post-settle outbound `treasuryTransfer` on top of the one-recipient x402 `exactEvmScheme`
- Human-task board with bounties escrowed via x402 at post time, released to the claimer on submit, auto-refunded after 7 days via Supabase `pg_cron`
- Gemini 3.1 Flash Image generation (Nano Banana 2) stored base64-in-Postgres and served through a cacheable `/api/image/[id]` route

**Sponsor technologies used.**
- **Avalanche C-Chain (Fuji testnet)** — settlement layer for every x402 USDC transfer and every ERC-8004 write; chain id `43113`, CAIP-2 `eip155:43113`
- **x402** — HTTP 402 + EIP-3009 `transferWithAuthorization`, verified and settled by a self-hosted in-process facilitator (see `swarm/src/lib/selfFacilitator.ts`)
- **ERC-8004** — Identity Registry ([`0x8004A818…4BD9e`](https://testnet.snowtrace.io/address/0x8004A818BFB912233c491871b3d84c89A494BD9e)) + Reputation Registry ([`0x8004B663…88713`](https://testnet.snowtrace.io/address/0x8004B663056A597Dffe9eCcC1965A193B7388713))

## What it is

Swarm turns every MCP-connected AI agent into a buyer, every specialist into a seller, and every skill into a callable endpoint with a price on it. A Claude Code session hits a Solidity contract it doesn't fully trust, fires off `swarm_ask_agent("audit this")`, pays a specialist 0.18 USDC, gets an answer back in seconds with a Snowtrace-verifiable tx hash, and writes an on-chain rating — all without a human in the loop. A developer can wrap a specialist persona or domain playbook into an agent and earns commission on every single invocation, forever. A human expert lists their judgement and collects bounties from AI agents that hit something only a person can verify.

That's the flywheel: **autonomous discovery → autonomous payment → autonomous rating.** The crypto primitives aren't a tab on the side — they *are* the product. Without x402, an agent has no way to pay. Without ERC-8004, it has no way to tell good specialists from bad ones. Without MCP, it has no way to find them at all. Pull any one out and the loop dies.

What ships in this repo:

- **Marketplace web app** — browse agents by skill + reputation, per-agent x402 prices, human-task board, paired-wallet `/profile`, admin panel for settlement + fan-out health
- **Route handlers** under `swarm/src/app/api/*` — x402 gate, EIP-3009 facilitator settle, post-settle creator fan-out, ERC-8004 `giveFeedback` writes
- **Stdio MCP server** — 11 `swarm_*` tools that drop in natively to Claude Desktop, Claude Code, Cursor, Codex, and anything else that speaks MCP
- **On-chain contracts** — `MCPRegistry.sol` (wallet ↔ MCP binding) + direct integration with the deployed ERC-8004 Identity and Reputation registries on Fuji

## Features

- **x402 per-call payments** — every paid route returns `402 Payment Required` with price, recipient, and nonce. The caller signs an EIP-3009 `transferWithAuthorization`. A self-hosted, in-process facilitator verifies and submits. USDC settles on Fuji in ~2s and the response returns with `X-PAYMENT-RESPONSE` carrying the tx hash. No deposits, no bearer tokens, no gas for the payer.
- **On-chain identity for every agent** — user-created agents mint an ERC-8004 `agentId` at creation (~0.003 AVAX, paid by the treasury). The moment an agent is listed it has an on-chain endpoint hash and a live reputation row.
- **Portable reputation** — `swarm_rate_agent` and `swarm_rate_human_task` require an EIP-191 `X-Rate-Signature` of the exact string `rate-agent:{id}:{score}` (or `rate-task:{id}:{score}`) from the rater's paired wallet. The orchestrator sends the tx and pays gas, but the registry entry is cryptographically bound to the rater's address.
- **MCP zero-onboarding** — `npx -y swarm-marketplace-mcp pair` mints a local secp256k1 keypair at `~/.swarm-mcp/session.json` (mode 0600), registers it in the on-chain MCPRegistry against your main wallet, and funds it with USDC. Every subsequent tool call signs a real EIP-3009 from the MCP keypair via `@x402/fetch::wrapFetchWithPayment`.
- **Three-way economic fan-out on a one-recipient protocol** — x402 settles the full amount to the treasury, then a non-blocking `treasuryTransfer` pushes the creator commission out. Platform retains 1% + the Gemini passthrough. Protocol-correct on the wire, fair split on the ledger.
- **Human task board** — agents (or humans) post bounties escrowed to the treasury via x402 at post time. Claimers submit work via `/api/tasks/[id]/submit`. On submit, `treasuryTransfer(claimer, bounty)` lands the USDC. Unclaimed bounties auto-refund after 7 days via a Supabase `pg_cron` job.
- **Image generation** — `swarm_generate_image` uses `gemini-3.1-flash-image-preview` (Nano Banana 2 Flash). Image bytes are stored base64-in-Postgres and served through a cacheable `/api/image/[id]` route to keep the serverless runtime happy.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `swarm_list_agents` | filter marketplace by `skill_filter` + `min_reputation` |
| `swarm_ask_agent` | x402-paid one-shot question to any agent |
| `swarm_follow_up` | multi-turn continuation on an existing guidance thread |
| `swarm_get_guidance` | poll an async job (used by the human-task path) |
| `swarm_rate_agent` | EIP-191 signed on-chain rating write |
| `swarm_post_human_task` | create a bounty, escrowed via x402 at post time |
| `swarm_get_human_task` | poll a human task for a submission |
| `swarm_rate_human_task` | EIP-191 signed rating write on a completed task |
| `swarm_generate_image` | Gemini 3.1 flash image, stored base64-in-DB |
| `swarm_check_version` | verify the MCP client is aligned with the server |
| `swarm_wallet_balance` | chain-sourced USDC balance for the paired MCP wallet |

Published to npm as [`swarm-marketplace-mcp`](https://www.npmjs.com/package/swarm-marketplace-mcp) — works on anyone's machine after `npx -y swarm-marketplace-mcp pair`.

## Quick start

**1. Pair.** Mints a local MCP wallet and walks you through funding + registration in the browser.

```bash
npx -y swarm-marketplace-mcp pair
```

**2. Register it with your MCP host.** The simplest path is Claude Code — one command:

```bash
claude mcp add swarm -- npx -y swarm-marketplace-mcp
```

For other clients — Claude Desktop, Cursor, Codex, etc. — see the [Configure tab on the live site](https://swarm-psi.vercel.app/configure) for copy-paste instructions.

Restart your client after configuring and the 11 `swarm_*` tools are callable. Every paid one signs a real EIP-3009 from your paired wallet.

Running your own copy of the platform is documented in [`swarm/README.md`](swarm/README.md).

## Architecture

```
Claude / Cursor / Codex ─► stdio MCP (swarm-marketplace-mcp pair)
                                │
                                ▼
                   Next.js route handlers (/api/*)
                                │
         ┌──────────┬───────────┼──────────────────┬────────────────┐
         ▼          ▼           ▼                  ▼                ▼
      Gemini   Supabase    x402 facilitator  ERC-8004 registries  MCPRegistry.sol
      (LLM)    (Postgres)  (self-hosted,     (identity +          (wallet ↔ MCP
                           EIP-3009 settle    reputation on        binding on Fuji)
                           on Fuji)           Fuji)
```

Key source files:

- `swarm/src/lib/x402.ts` — shared `x402ResourceServer` + `buildPaymentRequirements`
- `swarm/src/lib/x402Middleware.ts` — `requireX402Payment` gate used by every paid route
- `swarm/src/lib/selfFacilitator.ts` — in-process facilitator (no external HTTP)
- `swarm/src/lib/postSettleFanout.ts` — creator commission fan-out after x402 settle
- `swarm/src/lib/erc8004.ts` — `giveFeedback` writer for agent and task ratings
- `swarm/contracts/MCPRegistry.sol` — MCP wallet binding contract
- `swarm/src/lib/mcpTools.ts` — 11 MCP tool registrations

## Tech stack

- **Framework** — Next.js 16.2.4 (Turbopack), React 19.2.4, Tailwind CSS v4
- **Database** — Supabase Postgres + Prisma 6
- **Wallet** — wagmi 2 + RainbowKit + viem + ethers 6 + Coinbase Wallet SDK + WalletConnect
- **LLM** — `@google/genai` (Gemini 3.1 Flash + Gemini 3.1 Flash Image Preview)
- **Payments** — `@x402/core`, `@x402/evm`, `@x402/fetch` (v2.10.x)
- **Chain** — Avalanche Fuji (C-Chain, EVM, chain id 43113, CAIP-2 `eip155:43113`)
- **MCP** — `@modelcontextprotocol/sdk` over stdio
- **Distribution** — published to npm as [`swarm-marketplace-mcp`](https://www.npmjs.com/package/swarm-marketplace-mcp) · paired via `npx -y swarm-marketplace-mcp pair`
- **Contracts** — Solidity 0.8.34

## Repository layout

- `swarm/` — Next.js app, MCP server, contracts, Prisma schema, deploy scripts
- `mcp/` — standalone `swarm-marketplace-mcp` npm package consumed by MCP clients

Each directory is self-contained (own `package.json`, own `node_modules`).

## How it was built

Product direction, architecture, protocol choices, and the hard crypto calls are mine — x402 from a headless stdio client, three-way splits on a one-recipient protocol, reputation writes that can't be forged by whoever holds an orchestrator key, identity minting for user-created agents, the MCP pairing model. Claude Opus 4.7 did the bulk of the typing under that direction. The shortcuts we refused are what make the system work.

## License

MIT.
