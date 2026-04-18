# x402 Migration — Context for Future Agents

**Status:** planning complete, Phase 1 in progress.
**Plan file:** `/Users/davidabrahamyan/.claude/plans/goofy-brewing-clover.md` (full plan — read it first).
**This doc:** supplementary context — decisions, pushbacks, and reasoning behind the plan that aren't in the plan file itself.

---

## The one-line summary

Rip the treasury-custody + DB-balance model out entirely. Replace with **x402 HTTP-native payments** (402 → EIP-3009 signed → facilitator settles on Fuji in ~2s, no gas for payer) across every paid path. MCP becomes self-custodial: it owns its own USDC via a locally-minted keypair. Every UI surface (simulator, about, configure, pair, profile, README, tool descriptions) is rewritten x402-native. Plus three Avalanche-native integrations and an on-chain MCP registry.

## Why we're doing this

Hackathon challenge brief explicitly says: *"Build an application where AI agents can autonomously pay for … services using **x402** on Avalanche."* The current treasury-custody + DB-balance model is **not** x402. Judges reading the brief literally will dock heavily. This is a full rip, not a partial flip.

User's explicit scope statement (paraphrase of multiple messages):
> It's important that the website is x402 native across the board, same for the MCP. The simulator mimics x402, the about page, the pairing flow all get updated. We made lots of changes to support the treasury model and we are no longer using it, so this is a big change and you need to be thorough.

## Enablers already in the repo — DO NOT re-add

- `@x402/core`, `@x402/evm`, `@x402/fetch` **v2.10.0** already in `swarm/package.json`. Never imported yet. Don't `npm install` them again.
- `@x402/evm` ships native support for `eip155:43113` (Fuji) and `eip155:43114` (Avalanche mainnet).
- Default public facilitator: `https://x402.org/facilitator` (fallback: self-host via `@x402/core` `HTTPFacilitatorClient`).
- Fuji USDC (Circle `FiatTokenV2`) natively implements EIP-3009 `transferWithAuthorization`.
- `viem@2.48`, `wagmi@2.19`, `ethers@6.16`, `@coinbase/wallet-sdk` all installed.
- Core wallet connector **already wired** in wagmi config — don't re-add.

## Key architectural decisions (with reasoning)

### 1. Option A (self-custody MCP) over Option B (Permit2 delegated-spend)

Considered letting the MCP be delegated spender over the user's main wallet USDC via Permit2. Rejected:
- Adds a dependency + a signing step the user has to understand.
- Muddies the demo story — "MCP is autonomous" is cleaner than "MCP has delegated authority."
- Option A (MCP has its own keypair + USDC) is what x402's own docs and demos model.

Trade-off we accepted: leftover USDC at the MCP address after unpair — user must either sweep it by importing the key into a wallet app, or just leave it. We document this clearly in unpair CLI output and the README.

### 2. Post-settle fan-out pattern for commission split

`ExactEvmScheme` (x402's EVM scheme) accepts exactly ONE `payTo` per requirement. Our economics require a 3-way split (gemini passthrough + platform margin + creator commission). Solution:
- x402 settles `MCP → PLATFORM_PAYOUT_ADDRESS` (= `TREASURY_ADDRESS`) for the full amount.
- Post-settle, we call existing `treasuryTransfer(creator, commission)` — same helper already in `src/lib/treasury.ts`.
- Result: one x402 settle tx + one fanout tx per paid call. Snowtrace shows both. Same economics, different custody.

Fan-out failure is non-fatal (user already got their service). It's logged and surfaced in the admin dashboard for manual retry.

### 3. Payment direction is inbound-only

x402 is for "client pays server." We use it for: user → platform (every paid route).
We do NOT use it for: platform → creator fanout, platform → task-claimer payout. Those stay on `treasuryTransfer` (outbound from our signer).

So `treasury.ts::treasuryTransfer` survives and is load-bearing. Don't delete it.

### 4. Copy purge rule (non-negotiable)

After migration, **zero surviving user-facing mentions** of:
- "deposited balance" / "treasury balance"
- "autonomous allowance"
- "deposit to treasury" / "deposit flow"
- "pair your wallet" in the sense of "authorize this MCP to spend from your balance"

Every UI surface must talk in x402 terms: "fund your MCP address", "x402", "EIP-3009", "sign per call", etc. The grep gates in the Phase 4 verification catch regressions.

### 5. Prisma schema: deprecated columns, no destructive migration

`UserProfile.{balanceMicroUsd, autonomousCapUsd, autonomousSpentMicroUsd, autoTopup}` + `Deposit` + `DepositScanCursor` — mark deprecated via comments in `prisma/schema.prisma`, but don't drop them pre-demo. Reads + writes of these columns are removed from application code. Post-hackathon, a follow-up migration can drop them.

Reason: destructive migrations add risk + we'd lose any historical data that might be useful for judging/demo. The columns just sit there unused.

### 6. Avalanche-native integration strategy (after pushback)

User initially asked "why can't I just use Avalanche SDK" when I suggested skipping it. Context: `@avalabs/avalanchejs` is primarily for P-Chain/X-Chain. For C-Chain (EVM), it thin-wraps EVM calls — you still sign EIP-3009 via viem, still call `USDC.balanceOf` via ethers. `@x402/evm` hardcodes viem internally.

So we committed to integrations that are **substantive, not cosmetic**:
1. **Glacier API** for admin dashboard on-chain history — real indexer usage, not a hand-rolled ethers `getLogs`.
2. **AvaCloud RPC** via `FUJI_RPC_URL` env var (replacing hardcoded `api.avax-test.network`).
3. **`swarm/src/lib/avalanche.ts`** central chain-constants module, imports from `@avalabs/avalanchejs`.
4. **On-chain `MCPRegistry.sol`** on Fuji (Phase 6) — real contract deployment, not just SDK imports.

Judges will grep `package.json` and imports for `@avalabs/avalanchejs` — minimum three real usages across swarm server, swarm client, MCP.

### 7. MCP↔website pairing preserved via on-chain registry

Under x402, MCP keypairs are self-sovereign — no inherent link to the user's main wallet. Without something, `/profile` couldn't show "your paired MCPs." Considered DB-lightweight linking, rejected in favor of:

**On-chain `MCPRegistry` contract (Phase 6).** User's main wallet calls `register(mcpAddress)` on Fuji. `/profile` reads `getMCPs(owner)` from-chain. Unlink = `unregister(mcpAddress)`. UX is identical to today, but the source of truth moved from Prisma to Fuji. Bonus: another real Avalanche contract deployment for the rubric.

User explicitly OK'd this with: *"Yes... wait wdym slow okay tho. but yes add mcpregistry to plan."* ("slow okay" = they gave permission for on-chain operations despite ~2s block time.)

## Phase order + dependencies

Each phase leaves the system working. Don't skip ahead.

| Phase | Scope | Gate before next |
|---|---|---|
| 1 | x402 foundation files + smoke-test route | curl demo shows 402 → signed → settle |
| 2 | Flip `/api/guidance` + full MCP rewrite + pair page | Claude Desktop `swarm_ask_agent` runs x402 end-to-end |
| 3 | Flip `/api/image` + `/api/tasks` POST + browser marketplace | all paid routes settle via x402; no `manualSession` cookie |
| 4 | Teardown + full copy + simulator rewrite | zero mentions of treasury/deposit/allowance in `src/app/` |
| 5 | Avalanche SDK + Glacier + AvaCloud + admin dashboard | admin page shows settlements + fanouts via Glacier |
| 6 | On-chain `MCPRegistry` | pair via browser tx; `/profile` reads registry from-chain |

Phases 1–3 are the "system works" backbone. Phases 4–6 are thoroughness + sponsor signal.

## Env vars (add to `.env.local` + Vercel)

```
# x402
PLATFORM_PAYOUT_ADDRESS=<usually = TREASURY_ADDRESS>
X402_FACILITATOR_URL=https://x402.org/facilitator
X402_NETWORK=eip155:43113

# Avalanche infra (Phase 5)
FUJI_RPC_URL=<AvaCloud endpoint in prod, public RPC in dev>
GLACIER_API_KEY=<if required for higher rate limit — check AvaCloud docs>

# Admin (Phase 5)
ADMIN_ADDRESSES=0x…,0x…

# MCP Registry (Phase 6)
NEXT_PUBLIC_MCP_REGISTRY_ADDRESS=<deployed contract address>
```

## What NOT to touch

Still correct under x402; don't rewrite:
- `swarm/src/lib/reputation.ts` — ERC-8004 reputation wrappers.
- `swarm/src/lib/activity.ts` — extend with new event kinds, but logic stays.
- `swarm/src/lib/geminiCost.ts` — pricing math unchanged.
- `swarm/src/lib/config.ts` — extend, don't rewrite.
- `swarm/src/components/ActivityFeed.tsx`, `ActivityTicker.tsx`, `TransactionsPanel.tsx` — data sources unchanged; tx hashes displayed now come from x402 settles which is fine.
- `swarm/src/lib/treasury.ts::treasuryTransfer` — fanout + bounty payout signer.
- Core wallet connector in wagmi config — already there.

## Things explicitly out of scope

- Permit2/delegated-spend MCP keys (Option B).
- Destructive Prisma migrations (deprecate, don't drop).
- ICM / Teleporter / cross-L1 — days of work, marginal rubric gain.

## Open risks to watch during execution

1. **x402.org facilitator might not actually settle Fuji** even though `@x402/evm` supports the network. If Phase 1 smoke test fails here, spin up the self-hosted facilitator route (`swarm/src/app/api/facilitator/route.ts`) using `HTTPFacilitatorClient` from `@x402/core` — the package ships both sides.
2. **Treasury AVAX balance** — fanout needs gas. Admin dashboard surfaces this; top up via faucet if low.
3. **MCP session.json migration path** — users with a 0.9.x session have `{ token, address }`; new shape is `{ privateKey, address }`. On first launch of 0.10.0, detect the old shape and force a re-pair with a clear message. Don't try to auto-migrate — the old token can't generate a private key.
4. **Rate-limit Glacier** — in the admin dashboard, cache responses (30s) so page load doesn't hit Glacier on every render.

## Things the user has said matter to them

(From the conversation — recall these when making judgment calls.)

- "Don't mention AVAX" in user-facing onboarding copy. Surface USDC, hide the gas token unless strictly necessary.
- "IF THEY AREN'T ALREADY SET UP ON THE WEB" — the MCP-side onboarding should check web state and skip redundant steps. (Less relevant under x402 since the pair page IS the onboarding, but keep the principle.)
- Terse, plain copy > amber/jargon-heavy copy. An earlier message: "what does this even mean and why are the colors so weird."
- User is publishing the MCP package themselves when npm auth resolves — don't try to publish.
- User initially wanted to skip Avalanche SDK; after I explained the limitations they pushed back *"why are you pushing back so hard … avalanche is the sponsor."* → lesson: in a sponsor-judged hackathon, sponsor signal trumps pure technical purity. Include the integration, but be honest about what's substantive vs cosmetic.

## Where the plan lives + how to pick up work

- Full plan: `/Users/davidabrahamyan/.claude/plans/goofy-brewing-clover.md`.
- This context doc: `/Users/davidabrahamyan/vibes/cryptathon/X402_MIGRATION.md`.
- Repo conventions: `swarm/AGENTS.md` (currently documents the treasury model — this gets rewritten in Phase 4 to document x402).
- Current progress tracking: task list (TaskCreate/TaskList) within the active agent session.

To resume: read the plan file, then this doc, then `git log --oneline -20` to see what's already been committed, then pick up the next unchecked phase.
