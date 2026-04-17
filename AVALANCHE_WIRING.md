# Avalanche wiring — make the on-chain flows actually move value

**Audience:** a fresh Claude agent picking this up cold.
**Budget constraint from the user:** they have **0.5 AVAX on Fuji**. Every design choice below is picked to keep gas under that ceiling for the full demo. Do not add writes that cost more than ~0.01 AVAX each without flagging.
**Network:** Avalanche Fuji testnet (chainId `43113`, CAIP-2 `eip155:43113`).

---

## Read these first (do not skip)

The partner brief from Avalanche — the doc the user explicitly pointed to — lives at [`~/Desktop/partner-avalanche.md`](/Users/davidabrahamyan/Desktop/partner-avalanche.md). Open it first; it's the source of truth for what counts as "qualifying" for this track.

Links from that brief (these are the correct canonical URLs — don't use the older paths in `swarm/README.md`):

- **Avalanche Builder Hub** — https://build.avax.network
- **x402 Academy Course** — https://academy.avax.network (this is the one that matters most — the whole "pay-per-call" story depends on it; read the full settlement flow before touching `x402.ts`)
- **Avalanche SDK Docs / Full Documentation** — https://docs.avax.network
- **Testnet Faucet** — https://faucet.avax.network (have the user top up here if we run dry)

Use `WebFetch` on those URLs **before** touching `swarm/src/lib/x402.ts`. The current file is a stub with a TODO; you cannot port it correctly from general knowledge — you need the course's facilitator flow (402 challenge → EIP-3009 authorization → settle) in front of you.

Also read [`PLAN.md`](PLAN.md) — section "Exact Technical Config" (lines ~212–247) has the chain IDs, contract addresses, and the facilitator URL the team already picked. Don't re-research those — they're locked.

### Mapping our work to the partner's qualification requirements

From `partner-avalanche.md`, the required traits for this track are:

| Partner requirement | Where we satisfy it |
|---|---|
| "Triggered programmatically without human approval" | Phase 0 (wallet pairing with pre-approved USDC allowance) + the existing MCP envelope let Claude call `swarm_follow_up` and pay for it autonomously, with zero browser prompts during agent work. |
| "Settled instantly using stablecoins on Avalanche" | **Phase 2** below — real x402 on Fuji USDC. |
| "Gated by on-chain identity and reputation" | **Phase 1** (auto-register custom agents) + **Phase 5** (feedback never silently skipped) close this. Seeded agents already comply. |
| "Composed across multiple services or chains" | Partial credit via the routing/MCP orchestrator selecting specialists by reputation. Cross-chain (ICM) is explicitly **out of scope** for v1. |
| "Must deploy on Avalanche. If cross-chain, Avalanche is source or destination." | We're Fuji-only, so trivially satisfied. |

---

## The wallet model (locked)

Before anything else, understand the three-wallet topology that everything below assumes. It was consolidated deliberately to minimize funding surface and keep the 0.5 AVAX budget safe.

| Wallet | Address | Role | Funded? |
|---|---|---|---|
| **Orchestrator** | `0x349010ECC85F08faC36432Ca186D6A1f31844AB4` (env: `ORCHESTRATOR_ADDRESS`) | Server-side hot wallet. Signs ERC-8004 registrations, USDC forwards, platform-side writes. In the demo, doubles as the "paying user" wallet since there's only one human. | ✅ 0.5 AVAX + 20 USDC (Fuji) |
| **Platform agent receiver** | `0x5758ef79224e51745a8921f1dc5BC1524eB8C53C` (env: `PLATFORM_AGENT_ADDRESS`) | **Shared** receiving wallet for ALL 29 platform-made agents — the 5 conductor-adjacent specialists in `config.ts` (Chainsight, Solmantis, MEV Scope, RegulaNet, Human Expert = 3 `ai` + 1 `custom_skill` + 1 `human_expert`) plus the 24 demo listings in `demoData.ts` (8 `ai` + 8 `custom_skill` + 8 `human_expert`). Collects commissions. Never signs anything. | ❌ Does not need funding — pure receiver |
| **Custom-agent creators** | User-specific (whatever wallet is connected when they click "list skill") | Each custom user-listed agent routes commissions to its creator's own wallet via `walletAddress: creatorAddress` in `/api/agents/create`. | N/A — creators fund their own |

**Key simplification:** the old per-seeded-agent wallets (`LINGUABOT_ADDRESS`, `CODE_REVIEWER_ADDRESS`, `SUMMARIZER_ADDRESS`, `SOLIDITY_AUDITOR_ADDRESS`, `HUMAN_EXPERT_ADDRESS` in `.env`) are **deprecated as recipients**. `config.ts` has been updated so those specialists' `.address` fields now resolve to `PLATFORM_AGENT_ADDRESS`. The individual `_PRIVATE_KEY` env vars are retained only in case future peer-to-peer agent rating needs them — they are not used by any current code path.

For the 24 demo agents in `demoData.ts`, their per-agent `address` / `creatorAddress` fields use placeholder `demoAddress(N)` values (`0x00…0065`, etc.) that are nobody's real wallet. Those fields are **ignored at seed time**: `prisma/seed.ts` overrides `walletAddress` and `creatorAddress` with `config.platformAgentAddress` for every `demoAgentSeeds` entry. Do not touch `demoData.ts` itself — treat it as static reference data.

DB is the source of truth at runtime. After `npm run db:seed` (already run), every platform-made agent row in the `Agent` table has `walletAddress = 0x5758ef79…` and `creatorAddress = 0x5758ef79…`. Verified live: `curl /api/agents` returns 29 rows on the platform wallet + 3 user-created rows (as of this writing: 2 `custom_skill` + 1 `human_expert`) = 32 total.

**Heads-up about the landing page count** (`swarm/src/app/page.tsx` lines 68–81): the hero stat splits agents by **type**, not by origin — `services = ai + custom_skill` (currently 22) and `experts = human_expert` (currently 10). So "29 platform-made" and "22 services" are slicing different axes. If the next person asks why those don't match, point them here.

**Commission flow under the new model:**
```
  User wallet ──USDC (via x402)──▶ Orchestrator ──commission──▶ Recipient
                                                                    ↑
                                      platform agent:   PLATFORM_AGENT_ADDRESS
                                      custom agent:     agent.creatorAddress
```

The implementing agent should keep using `agent.walletAddress` (or `agent.creatorAddress`) from the DB as the commission recipient — **do not** hardcode a branch on agent type. The DB now reflects correct recipient wallets for both categories.

## Current state — what actually moves value vs. what's faked

| Flow | Code path | On-chain today? | Gas/tx today |
|---|---|---|---|
| ERC-8004 register (seeded agents) | [`/api/register-agents`](swarm/src/app/api/register-agents/route.ts) → [`registerAgent`](swarm/src/lib/erc8004.ts:21) | **Real.** Writes `register(string)` on IdentityRegistry. | ~0.003 AVAX |
| ERC-8004 register (custom / user-listed agents) | [`/api/agents/create`](swarm/src/app/api/agents/create/route.ts) | **Missing.** DB row only — no on-chain mint. | 0 |
| ERC-8004 feedback (agent rating) | [`/api/agents/[id]/rate`](swarm/src/app/api/agents/[id]/rate/route.ts) → [`giveFeedback`](swarm/src/lib/erc8004.ts:46) | **Real when `agent.agentId` is set** (i.e. only for seeded agents). Custom agents silently DB-only. | ~0.005 AVAX |
| x402 pay-per-call (guidance, ask) | [`withX402`](swarm/src/lib/x402.ts) | **Simulated.** Returns `{ simulated: true }`. No 402 challenge, no USDC move. | 0 |
| Guidance three-way split (creator commission + Gemini passthrough + platform fee) | [`/api/guidance`](swarm/src/app/api/guidance/route.ts) lines 105–146 | **Recorded in DB only.** Numbers computed but not transferred. | 0 |
| Task bounty escrow on post | [`/api/tasks`](swarm/src/app/api/tasks/route.ts) POST | **Missing.** DB row only — bounty is a string field, no USDC locked. | 0 |
| Task bounty payout on submit | [`/api/tasks/[id]/submit`](swarm/src/app/api/tasks/[id]/submit/route.ts) | **Missing.** Status flipped to `completed`, activity log lies ("paid to expert"). No USDC moved. | 0 |
| Wallet connect (user side) | [`swarm/src/lib/wagmi.ts`](swarm/src/lib/wagmi.ts) | **Real.** Fuji chain, RainbowKit, Core wallet first. | — |

**Translation of the honest truth:** today the app looks like a marketplace but only two things are real on-chain — ERC-8004 identity for the 4 seeded agents, and ERC-8004 feedback for those same 4. Everything else is theater.

The hackathon requirement is real pay-per-call over x402 + real ERC-8004 reputation. You're filling in the missing plumbing.

---

## What to build, in order

The order matters: cheapest and most isolated first, so the user can top up AVAX if needed without blocking later steps.

### Phase 0 — MCP ↔ wallet pairing + budget authorization (cost: ~0.001 AVAX one-time per user, paid by the user's wallet, not the orchestrator)

**This is the gate for everything else.** Today the MCP sends `asker_address: "mcp_client"` — a string label, not a real identity. Every paid flow below assumes the server can identify the payer's wallet and pull pre-authorized USDC from it. Without pairing, none of that works and x402 has nothing to sign against.

User experience target: "first time the user loads the MCP, it prints a link; they open it, connect wallet, pick a budget, sign once, close the tab, and never think about it again — agent calls just work until budget runs out."

**Architecture — session-key / delegated spend pattern:**

1. **MCP first boot** ([`mcp/src/index.ts`](mcp/src/index.ts)): on startup, check for `~/.swarm-mcp/session.json`. If absent or expired, enter pair mode:
   - Generate a one-time pair code (16-char urlsafe random, e.g. `pair_a1b2c3d4...`).
   - `console.error` the pair URL: `${SWARM_API}/pair?code=${pairCode}` — stderr is what Claude Code / Cursor / Codex show in their UI.
   - Poll `GET ${SWARM_API}/api/pair/claim?code=${pairCode}` every 2s (long-poll up to 10 min). Until claimed, **refuse to serve tool calls** — respond with `{ error: "awaiting_pair", pairUrl }` so the agent surfaces the link to the user.
   - Once claimed, the response returns `{ address, budgetUsd, sessionToken, expiresAt }`. Persist to `~/.swarm-mcp/session.json` (mode 0600). Done — further calls inject `Authorization: Bearer ${sessionToken}`.

2. **New `/pair` page** ([`swarm/src/app/pair/page.tsx`](swarm/src/app/pair/page.tsx)): reads `?code=...` from query. Shows:
   - The code (so user can verify it matches what MCP printed).
   - **Wallet connect button** (reuse existing RainbowKit in [`swarm/src/lib/wagmi.ts`](swarm/src/lib/wagmi.ts) — the infrastructure is already there).
   - **Budget input** — dollar amount (default $5, hard cap $50 for the demo). This becomes the USDC allowance.
   - **"Authorize MCP Session"** button, which triggers two wallet actions in sequence:
     1. **EIP-712 signature** of a `PairAuthorization` struct: `{ code, address, budgetUsd, expiresAt, chainId: 43113 }`. No gas, just a sig. Server verifies this via `ecrecover` to prove the wallet owner authorized this specific session.
     2. **One USDC `approve(orchestrator, budgetUsd * 10^6)`** transaction. This is the ONE on-chain write the user's wallet makes. ~0.001 AVAX in gas. After this, every x402 call pulls from this allowance silently.
   - On success: `POST /api/pair/claim` with `{ code, signature, authorizationPayload }`. Server verifies sig, creates `McpSession` row, generates an opaque `sessionToken`, returns it. Page shows "✅ Paired — you can close this tab."

3. **New endpoints:**
   - `POST /api/pair/start` — MCP-initiated. Creates a `PairCode` row (code + status=`pending` + `createdAt`). Returns `{ code, pairUrl }`. (Optional — MCP can generate the code locally and the backend only sees it when claimed. Simpler to just have MCP generate it and skip this.)
   - `POST /api/pair/claim` — browser-initiated from `/pair`. Body: `{ code, signature, address, budgetUsd, expiresAt }`. Verifies EIP-712 signature matches `address`. Checks `USDC.allowance(address, orchestrator)` on-chain to confirm approve landed (or give a 30s grace + polling). Inserts `McpSession { token, address, budgetUsd, spentUsd: 0, expiresAt }`. Returns `{ success: true }`.
   - `GET /api/pair/claim?code=` — MCP poll endpoint. Returns either `{ claimed: false }` or `{ claimed: true, address, budgetUsd, sessionToken, expiresAt }`.
   - `POST /api/session/verify` (internal, called by other routes) — given `Authorization: Bearer <token>`, returns the bound address + remaining budget, or `401`.

4. **New Prisma model** ([`swarm/prisma/schema.prisma`](swarm/prisma/schema.prisma)):
   ```prisma
   model PairCode {
     code       String   @id
     status     String   // "pending" | "claimed" | "expired"
     sessionId  String?  // set when claimed → references McpSession
     createdAt  DateTime @default(now())
     @@index([createdAt])
   }

   model McpSession {
     id         String   @id @default(uuid())
     token      String   @unique
     address    String   // the paired wallet (lowercase)
     budgetUsd  Float    // cap
     spentUsd   Float    @default(0)
     expiresAt  DateTime
     createdAt  DateTime @default(now())
     revokedAt  DateTime?
     @@index([address])
     @@index([token])
   }
   ```
   Migration name: `add_mcp_pairing`.

5. **Wire into the guidance route** ([`swarm/src/app/api/guidance/route.ts`](swarm/src/app/api/guidance/route.ts)):
   - If `Authorization: Bearer ...` header present: verify session, derive `askerAddress` from session row (overrides anything in the body).
   - Before calling the LLM: check `session.spentUsd + estimatedCost <= session.budgetUsd`. If not, return `402 { error: "budget_exhausted", spent, budget, topUpUrl }`.
   - After successful call: `UPDATE McpSession SET spentUsd = spentUsd + totalUsd WHERE id = ...`. (Approximate — Gemini cost is known post-hoc, so compute final total before incrementing.)
   - If no auth header (e.g. someone hitting the API directly from the web UI): fall back to current behavior. Web UI has its own wallet connect and doesn't need session pairing.

6. **MCP client wiring** ([`mcp/src/index.ts`](mcp/src/index.ts), [`mcp/src/session.ts`](mcp/src/session.ts) — new file):
   - New module `session.ts`: `ensureSession(): Promise<Session>`, `loadSession()`, `saveSession()`, `clearSession()`, `injectAuth(fetch)`.
   - `ensureSession()` is called once at server boot before `server.connect(...)`. If it returns a valid session, proceed. If it throws `PairingRequired`, the server still starts but every tool call returns a pair reminder until paired.
   - All `fetch(`${SWARM_API}/api/...`)` calls get a session header injected.

**Gas / budget note:** the user's wallet pays ~0.001 AVAX one-time for the `approve()`. That's within their 0.5 AVAX budget. The orchestrator's AVAX is NOT touched for pairing. Subsequent x402 settlements are gas-free for both sides (facilitator covers it).

**Security notes for the implementing agent:**
- Use `ethers.verifyTypedData` for the EIP-712 check. Reject if recovered address ≠ claimed address.
- `sessionToken` must be crypto-random (at least 32 bytes) and stored only in DB — never logged.
- Set `expiresAt` to 30 days default. Let the user override on the pair page.
- Add a `/profile` UI element showing active MCP sessions + a "revoke" button that sets `revokedAt` and (optionally) calls `USDC.approve(orchestrator, 0)` to yank the allowance on-chain.
- `spentUsd` tracking is advisory — the REAL cap is the on-chain USDC allowance. Even if our DB desyncs, an attacker can't drain more than the allowance.

**Verify:**
1. Launch MCP locally with no existing session. Confirm it prints the pair URL to stderr and refuses tool calls with `{ error: "awaiting_pair" }`.
2. Open pair URL → connect wallet → pick $5 budget → approve. Confirm `USDC.allowance(myWallet, orchestrator)` on Fuji explorer reads `5000000` (5 USDC with 6 decimals).
3. Confirm `~/.swarm-mcp/session.json` exists with correct address.
4. Re-launch MCP → no pair prompt, session reused.
5. Make a paid guidance call → confirm `McpSession.spentUsd` increments, USDC actually moves from paired wallet → orchestrator via x402 (requires Phase 2 to be done).
6. Exhaust budget via rapid-fire calls → confirm route returns `402 budget_exhausted`.
7. Revoke via UI → confirm future calls return `401`.

### Phase 1 — Auto-register custom agents on creation (cost: ~0.003 AVAX per new custom agent)

The seeded agents already register via `/api/register-agents`. User-created agents don't. This breaks the reputation story because any custom agent's `giveFeedback` call will be a no-op (the DB rate route only fires on-chain when `agent.agentId` is set, see [`/api/agents/[id]/rate/route.ts`](swarm/src/app/api/agents/[id]/rate/route.ts)).

**Change:** [`/api/agents/create/route.ts`](swarm/src/app/api/agents/create/route.ts).

After the `db.agent.create(...)` call, call `registerAgent(config.orchestrator.privateKey, agentURI)` with the same `agentURI` JSON shape that `/api/register-agents` uses. Update the row with the returned `agentId`. Wrap in try/catch — if registration fails, keep the DB row but log the failure and surface it in the response so the creator knows to retry (don't delete their agent).

**Do not** make the user pay the registration gas from their own wallet for v1. The orchestrator key is already funded and already pays for seeded registrations — just reuse it. A future improvement is signer-funded registration, but that requires wiring `useWalletClient` into the create form and is out of scope for this pass.

**Verify:** Create a custom agent via the UI. In Fuji explorer, confirm a `Registered` event was emitted from the orchestrator address. Check DB: `agent.agentId` is populated.

### Phase 2 — Real x402 payment enforcement (cost: 0 AVAX — facilitator pays gas)

This is the big one. Right now every paid route is free. The x402 course (link above — **go read it**) describes the protocol:

1. Client calls the resource endpoint.
2. Server returns `402 Payment Required` with a `X-PAYMENT-REQUIRED` JSON payload describing price, payTo, asset, chain, facilitator URL.
3. Client signs an **EIP-3009 `transferWithAuthorization`** message (USDC supports this — it moves USDC from payer to payTo off-chain until settlement).
4. Client replays the request with `X-PAYMENT: <base64 signed authorization>`.
5. Server forwards the authorization to the facilitator at `https://facilitator.ultravioletadao.xyz` — the facilitator submits the on-chain settlement and returns a receipt.
6. Server returns the real 200 response with `X-PAYMENT-RESPONSE: <receipt>`.

**The facilitator covers gas.** This is the "0 AVAX" in the table above — the user's 0.5 AVAX is untouched by x402. That's the whole point of the Ultravioleta facilitator.

**What's needed in the code:**

- `swarm/src/lib/x402.ts` — replace the stub. The old code used `@x402/express` which won't work in Next.js App Router. Check the x402 course for a non-Express flow, or use the headers directly. The key protocol pieces are:
  - `X-PAYMENT-REQUIRED` challenge header shape (course documents it)
  - EIP-3009 message digest construction (USDC on Fuji supports `transferWithAuthorization`)
  - POST to `${config.facilitatorUrl}/settle` with the signed authorization
  - Receipt validation before releasing the response
- Add an env flag `X402_ENFORCE=true` to opt into real enforcement. When false, keep the simulated behavior so local dev without AVAX still works. Default to `true` in production.
- Wrap these routes (they're the paid ones):
  - [`/api/guidance`](swarm/src/app/api/guidance/route.ts) POST — price = computed `totalUsd`
  - The MCP tool endpoints that charge (ask, follow-up) go through `/api/guidance` so they inherit this.
- **Do NOT wrap** GET routes or the rating routes — rating is a gas cost on the rater, not a paid service.

**Pricing side note on guidance:** the three-way split today (`commission + geminiCost + platformFee`) is computed correctly. Under real x402, the payer pays the `total` in USDC, but the receiving address for the transfer should be the **orchestrator** (single `payTo`), and then a **separate on-chain transfer** from orchestrator → creator delivers the commission. Rationale: x402 is one payer → one payTo; a three-way split needs a second settlement hop. The orchestrator-as-hub model keeps the demo simple. See Phase 4 for that second hop.

**Verify:** From a client without USDC approval, call `/api/guidance` → expect `402`. Sign authorization, retry → expect `200` + `X-PAYMENT-RESPONSE` header + on-chain USDC movement visible on the Fuji USDC contract explorer (`0x5425890298aed601595a70AB815c96711a31Bc65`).

### Phase 3 — Task bounty escrow + payout (cost: ~0.002 AVAX per post, ~0.002 AVAX per payout)

Tasks claim to escrow a USDC bounty. Today they don't.

**On task post** ([`/api/tasks`](swarm/src/app/api/tasks/route.ts) POST): require the caller's signed EIP-3009 authorization moving `bounty` USDC from them to an escrow address (simplest: the orchestrator). Store the authorization or the tx hash on the Task row (add `escrowTxHash String?` to `Task` in schema). Reject the post if the transfer fails.

**On task submit** ([`/api/tasks/[id]/submit`](swarm/src/app/api/tasks/[id]/submit/route.ts)): after flipping status to `completed`, call a simple `USDC.transfer(task.claimedBy, task.bounty)` from the orchestrator wallet. Store that `payoutTxHash` on the row too.

**Minimizing gas:** both are single USDC ERC-20 transfers. ~21k gas × ~25 nAVAX gas price = ~0.0005 AVAX. Budget easily holds.

**Cancellation path:** if a posted task is never claimed or gets abandoned, add `/api/tasks/[id]/cancel` that refunds the escrow to `postedBy`. Out of scope to wire in UI for this pass — just expose the route so the user can call it manually if needed.

**Verify:** Post a task with a 1 USDC bounty from a funded test wallet. Confirm USDC leaves posterBy wallet and lands at orchestrator. Claim + submit. Confirm USDC leaves orchestrator and lands at claimer.

### Phase 4 — Guidance commission payout to agent creators (cost: ~0.002 AVAX per paid call)

Once Phase 2 is real, the orchestrator holds the full `totalUsd` in USDC after every paid guidance call. The current DB records `commissionUsd` per row but never sends it to the creator.

**Change in [`/api/guidance/route.ts`](swarm/src/app/api/guidance/route.ts):** after the `db.guidanceRequest.update(...)` that writes the breakdown, do an orchestrator → `agent.creatorAddress` USDC transfer for `commissionUsd`. Store `commissionTxHash` on the row. Platform fee + Gemini passthrough stay with the orchestrator (that's the intended split).

**Gas concern:** this fires on every paid ask + every follow-up. If the demo does 50 calls that's ~0.1 AVAX. Within budget but worth **batching for v2** — accumulate per-creator balances in DB, flush on a timer or when a threshold is hit. For v1, one-transfer-per-call is fine and simpler to verify.

Skip this entirely for seeded agents where `creatorAddress === orchestrator.address` (no-op transfer wastes gas).

**Verify:** Make a paid guidance call from a wallet. Check USDC flow: payer → orchestrator (full total), orchestrator → creator (commission only). Orchestrator retains Gemini passthrough + platform fee.

### Phase 5 — Tighten ERC-8004 feedback so it always fires (cost: 0 AVAX new — same write, just not skipped)

Today [`/api/agents/[id]/rate/route.ts`](swarm/src/app/api/agents/[id]/rate/route.ts) only calls `giveFeedback` on-chain if `agent.agentId` is set. After Phase 1, every agent (seeded + custom) will have `agentId`. So this step is really: **audit that the on-chain call is not silently skipped for any path**, and if Phase 1 registration fails for some custom agent, the rate route should try to register it on-the-fly before calling `giveFeedback`.

**Verify:** rate every agent once from a fresh wallet. Confirm 1 `Feedback` event per rate on the ReputationRegistry (`0x8004B663056A597Dffe9eCcC1965A193B7388713`).

---

## Gas budget — expected consumption for a full demo run

Assuming the demo exercises: 1 MCP pairing + 4 seeded registrations (already done) + 2 custom agent creations + 20 paid guidance calls + 2 tasks posted + 2 tasks claimed + 2 tasks submitted + 10 ratings.

| Write | Count | AVAX each | Paid by | Total |
|---|---:|---:|---|---:|
| USDC approve (one-time pairing) | 1 | 0.001 | user wallet | 0.001 |
| ERC-8004 register (custom) | 2 | 0.003 | orchestrator | 0.006 |
| x402 settle (facilitator pays) | 20 | 0 | facilitator | 0 |
| USDC transfer: escrow in | 2 | 0.0005 | task poster wallet | 0.001 |
| USDC transfer: bounty payout | 2 | 0.0005 | orchestrator | 0.001 |
| USDC transfer: commission payout | 20 | 0.0005 | orchestrator | 0.010 |
| ERC-8004 feedback | 10 | 0.005 | orchestrator | 0.050 |
| **Orchestrator total** | | | | **~0.067 AVAX** |
| **User wallet total** | | | | **~0.002 AVAX** (if user is also poster) |

Well under 0.5 AVAX with 7× headroom. Real danger is Phase 5 if ratings spike — feedback writes are the most expensive. If budget gets tight, cap demo ratings.

---

## Files you'll touch

**Modify:**
- `swarm/src/lib/x402.ts` — replace stub with real facilitator flow
- `swarm/src/app/api/agents/create/route.ts` — add `registerAgent` call after DB insert
- `swarm/src/app/api/guidance/route.ts` — verify MCP session auth; add commission payout transfer; wrap with real x402
- `swarm/src/app/api/tasks/route.ts` — require escrow transfer on post
- `swarm/src/app/api/tasks/[id]/submit/route.ts` — add payout transfer on submit
- `swarm/src/app/api/agents/[id]/rate/route.ts` — fall through to register-then-feedback if `agentId` missing
- `swarm/prisma/schema.prisma` — add `PairCode`, `McpSession` models (Phase 0) + `escrowTxHash`, `payoutTxHash`, `commissionTxHash` as optional columns on `Task` and `GuidanceRequest`. Two migrations: `add_mcp_pairing` then `add_onchain_hashes`.
- `mcp/src/index.ts` — call `ensureSession()` on boot; inject `Authorization: Bearer` on every `fetch`.

**Create:**
- `swarm/src/app/pair/page.tsx` — wallet connect + budget picker + approve flow
- `swarm/src/app/api/pair/claim/route.ts` — POST claim + GET poll
- `swarm/src/app/api/session/verify/route.ts` — internal session check helper
- `mcp/src/session.ts` — pair-code generation, polling, `~/.swarm-mcp/session.json` persistence, auth header injection
- `swarm/src/app/api/tasks/[id]/cancel/route.ts` — refund abandoned task bounties
- `swarm/src/lib/usdc.ts` — shared helper for `USDC.transfer(to, amount)` and `USDC.allowance(owner, spender)` reads. Use the orchestrator signer.
- `swarm/src/lib/session.ts` — server-side helper: `getSessionFromRequest(req) → McpSession | null` for routes to enforce auth.

**Do NOT touch:**
- `swarm/src/lib/erc8004.ts` — the existing functions are correct, just underused.
- `swarm/src/lib/config.ts` — addresses are right.
- `swarm/src/lib/wagmi.ts` — client-side chain config is fine.

---

## Verification plan (run before declaring done)

1. **AVAX balance sanity** — log orchestrator balance at start, run full demo, log at end. Assert delta ≤ 0.1 AVAX.
2. **Explorer confirmations** — for each transfer, open the Fuji explorer link and eyeball that the tx is mined and the USDC/AVAX amounts match.
3. **DB integrity** — for every `Task` with `status=completed`, confirm `payoutTxHash IS NOT NULL`. For every `GuidanceRequest` with `status=ready` on a custom agent, confirm `commissionTxHash IS NOT NULL`.
4. **x402 handshake trace** — capture network logs for one paid guidance call: should show 402 → 200 with `X-PAYMENT-RESPONSE` header and USDC moving in the same window.
5. **Fallback** — unset `X402_ENFORCE` and confirm local dev still works without USDC (simulated mode stays functional).

---

## Out of scope (explicitly)

- Batching commission payouts (v2)
- Signer-funded (user wallet pays gas) ERC-8004 registration (v2)
- Cross-chain settlement (Fuji only)
- Solidity contract deployment — reuse the existing 8004 deployments and Circle USDC on Fuji
- Facilitator self-hosting — use Ultravioleta's hosted endpoint
- Wallet UX polish — assume user has Core / MetaMask with Fuji + USDC already set up

---

## One more thing

Before you touch a single line of x402 code, **`WebFetch https://academy.avax.network`** (and drill into the x402 course from there) and read the settlement flow end-to-end. Cross-reference with https://docs.avax.network for the Avalanche SDK bits. The stub in `x402.ts` is wrong enough that guessing will waste the user's time and AVAX. The partner brief and the academy docs are the source of truth here.
