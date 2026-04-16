# Swarm — Next Steps

Handoff document. Covers what exists, what's real vs cosmetic, the honest gap list, and the prioritized path from hackathon demo → production product.

---

## 1. What actually works today

### Working end-to-end
- **Marketplace**: 29 specialized agents + 8 human experts seeded, rendered in a dense DataTable with filters, ⌘K search, type chips, inverse-hover row navigation.
- **Agent detail** (`/agent/[id]`): two-pane terminal layout, live "try it" input that calls the agent through `/api/agents/:id/call`, 1–5 rating writes to ERC-8004 (if agent is registered).
- **Orchestrator (planner)** (`/orchestrate`): decomposes a complex prompt via Claude, picks agents by heuristic, hires via `/api/agents/:id/call`, escalates to humans if needed, returns composed result. Also exposed over MCP as `swarm_orchestrate`.
- **Task board** (`/tasks`): lists tasks, claim + submit flow works with an Avalanche wallet.
- **MCP server** (`server/mcp.ts`): 5 tools over stdio (`swarm_list_agents`, `swarm_call_agent`, `swarm_rate_agent`, `swarm_post_human_task`, `swarm_orchestrate`). Tested working with Claude Desktop.
- **Connect page** (`/connect`): live MCP status polling, "ping MCP" button, OS-detected config generator, tabs for Claude Desktop / Claude Code / Cursor / Codex / programmatic.
- **Profile** (`/profile`): wallet-gated. Inline **list a skill**, **apply as expert**, and **funding / spend-limit** panels. Reads/writes `creatorAddress === wallet` scope.
- **JSON-file persistence** (`server/lib/persist.ts`): user-created agents + expert applications + tasks survive server restarts. Seed data reloads from code each boot.
- **Activity ticker**: 3-row auto-rotating feed with pop-in animation, synthetic events every 2.6s for demo liveness, real server events merged in every 5s.
- **Boot splash**: terminal-style init sequence on first load per session, skippable with Esc/Enter/Space.
- **Status bar**: fixed-bottom chrome with live MCP status, block number, wallet state, ⌘K hint.

### Working for developer / deploy
- **x402 middleware** is wired on every `/api/agents/:id/call` route using the per-agent price and creator payout address. Ultravioleta facilitator configured. Agent calls issue 402 → client signs payment → settlement.
- **ERC-8004 writes** land on Fuji when `agentId` is registered. `POST /api/register-agents` handles the one-time setup.

---

## 2. What's cosmetic vs functional

This section matters because it answers "does any of this actually do anything, or is it LARP?"

| Thing on screen | Real or cosmetic? |
|---|---|
| `MCP · 5 TOOLS` status (hero, status bar) | **Real** — polls `GET /api/mcp/status` every 10s. |
| `AVALANCHE FUJI · CHAIN 43113` | **Real** — chain ID from wagmi config, matches `config.chainId`. |
| `29 SERVICES / 9 EXPERTS` | **Real** — derived from agent registry. |
| `BLK 38,204,...` ticking in status bar | **Cosmetic** — a fake increment. Replace with a real `useBlockNumber()` hook (wagmi) to make it live. |
| `❯ npm run mcp --prefix swarm` | **Real copyable command** — actually boots the stdio MCP server. |
| `LIVE FEED` (3 rows with [$]/[★]/[◎]/[+]) | **Half-real** — real server events are merged in every 5s. Synthetic events every 2.6s keep it moving during quiet demo periods. |
| Typewriter "Pay per call. Trust on-chain." | Cosmetic animation, but the values (x402, ERC-8004) are real plumbing. |
| `[ connect wallet ]` button | **Real** — RainbowKit ConnectButton, connects an injected browser wallet and gates profile. |
| "How agents pay" step cards | **Aspirational** — steps 2 (set budget) and 4 (replayable receipts) are described but not enforced. Funding panel persists limits to localStorage; no on-call enforcement yet. |
| Boot splash ASCII + log lines | Cosmetic. |
| Pricing model per agent (`tiered`, `per-token`, etc.) | **Labeled but not enforced**. The x402 middleware still uses a flat price per call. A tiered agent's "+20% per tier" note is advertised but the middleware doesn't actually charge more. See §5. |

---

## 3. Honest gap list (what needs real work)

### Critical for real users
- **No Sign-In-With-Ethereum.** Wallet connection = presence check only. Any client can POST with any wallet address. Add SIWE so the server verifies `address` ownership before allowing `/api/experts/apply`, `/api/agents/create`, or `/api/tasks/:id/claim`.
- **No WalletConnect.** Only injected browser wallets work. Ship a real `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (free at `cloud.reown.com`) and re-enable `getDefaultConfig` in `src/lib/wagmi.ts` so mobile wallets work.
- **Single-server assumption.** JSON file in `/data/swarm.json` is fine for one VM. If you scale out, switch to Postgres (see §4).
- **Budget enforcement is advertised but not implemented.** The per-task / per-session caps in `/profile#funding` are saved to localStorage but never checked before `swarm_call_agent` fires. The MCP client would have to enforce them. Wire it into `server/mcp.ts` as an envelope check per session.
- **x402 flat price only.** Per-agent price is static at registration time. Pricing-model labels on the agent detail page (`tiered`, `per_token`) are informational.

### Good-to-have
- **No ERC-8004 registration UI.** You have to hit `POST /api/register-agents` by hand. Add a "register on-chain" button to each user-created agent in Profile.
- **Orchestrator error surfacing.** `callAgent` calls Gemini and throws if `GEMINI_API_KEY` is missing. If the provider call itself fails (log: `ApiError: 403 ...`) the orchestrator silently degrades to a one-subtask guess. Add proper error surfacing.
- **No task deadline enforcement.** `description`/`bounty`/`skill` are captured but `deadline` isn't a field. Add it; auto-expire unclaimed tasks back to OPEN or refund the poster.
- **No agent pagination.** The marketplace loads all 29 agents at once. Fine now, breaks at ~1000.
- **Activity ticker synthetic events inflate the demo.** In production, turn off the `SYNTHETIC_EVENTS` injector in `ActivityTicker.tsx` and rely purely on real server activity.
- **Landing `BLOCK` counter** in status bar fakes an increment every 2.2s. Replace with `useBlockNumber({ chainId: avalancheFuji.id })` from wagmi.

### Cosmetic / naming
- **"Orchestrator" naming.** The product calls it orchestrator in code and `/orchestrate` URL, but the UI now reads "planner". Pick one and apply everywhere. My suggestion:
  - **Planner** — descriptive, honest about decompose/select/call/assemble shape. Matches the sub-nav flow chip.
  - Alternatives: `Router`, `Dispatcher`, `Composer`, `Workflow`. Avoid `Agent` (collision), avoid `Chain` (overloaded in crypto).
- **Swarm logo** is a wordmark only right now (`❯ swarm_`). Fine for a hackathon. For real brand work, commission a designer — don't let an AI pick it.
- **Copy tone**. Hero lines are punchy. Funding section and "earn on swarm" are OK. The "how agents pay" steps 03–04 are slightly over-promising vs implementation (see §3 critical).

---

## 4. Production path (ranked by impact × effort)

### Tier 1 — ship these before inviting real users

1. **Deploy the server somewhere public** (Fly.io, Railway, Render, or a VPS). ~15 min. Set `SWARM_API_URL` env on every MCP client config. Now friend's Claude on their laptop + you in the browser + random human on their phone all talk to the same server. Multi-device works.
2. **Add a `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`** (free, 2 min at cloud.reown.com), swap `createConfig` → `getDefaultConfig` in `src/lib/wagmi.ts`. Mobile wallets work.
3. **Add SIWE.** Use `siwe` npm package. Flow: on first wallet connect, frontend requests a nonce from server, signs it, posts signature back. Server verifies via `ethers.verifyMessage`, issues an HttpOnly JWT cookie. All mutation endpoints read `req.wallet` from the cookie instead of trusting body field. ~half a day.

### Tier 2 — before you have >1 server instance

4. **Swap JSON file for Postgres.** `prisma init`, schema for `Agent`, `Task`, `Expert`, `Activity`. Migrate `hydrateFromSnapshot()` + `persist()` to `prisma.agent.upsert`. ~2 hrs if you know Prisma. The seeded `demoAgentSeeds` stay in code as dev fixtures.
5. **Move the activity log to Postgres** too. Drop `SYNTHETIC_EVENTS` injection. Let real traffic fill the feed.
6. **Replace the orchestrator's in-memory state machine** with durable task rows. Right now if the server restarts mid-orchestration, the planner forgets what subtasks were in flight.

### Tier 3 — real pricing + budget

7. **Implement tiered pricing**: the x402 middleware currently takes a static `price` per route. Replace with a function that inspects the request body and returns a price. E.g. Chainsight: `priceFor({ hops }) => 0.14 + Math.max(0, hops - 10) * 0.028`. The 402 response includes the quoted price; the client signs that exact amount.
8. **Implement budget enforcement**: the MCP server already knows which session called which tool. Add an envelope check before forwarding the call: `if (sessionSpent + quotedPrice > perSessionCap) return { error: "budget exceeded" }`. Session-scoped.
9. **Per-token pricing for research/summarization agents**: wrap the agent call with a token counter (Gemini returns usage metadata); quote in the 402 response based on input length.

### Tier 4 — scale

10. **Horizontal scale**: move sessions + budgets to Redis. Move activity log to a pub-sub (Redis / Postgres LISTEN-NOTIFY) so multi-instance feeds stay consistent.
11. **Reputation aggregation**: ERC-8004 writes are on-chain but we cache read values in memory. Add a background job that pulls reputation from the Registry every N blocks.

---

## 5. Concrete file-by-file map (for whoever picks this up next)

| Area | Files | Notes |
|---|---|---|
| Wagmi / RainbowKit | `src/lib/wagmi.ts`, `src/app/providers.tsx` | `RainbowKitProvider` is mount-gated in a `ClientRainbowKit` wrapper because its `getRecentWalletIds()` touches `localStorage` during SSR. If you re-enable `getDefaultConfig`, keep the mount gate. |
| SIWE | (new) `src/lib/siwe.ts` + `server/lib/auth.ts` | Not in repo yet. Propose: cookie-based JWT after signature verification. |
| Pricing | `server/lib/x402.ts` + `server/index.ts` `buildX402Routes()` | Currently static `price: agent.price`. Swap to a request-aware quote. |
| Persistence | `server/lib/persist.ts` | JSON file. Replace with Prisma client. |
| Agent registry | `server/index.ts`, `src/lib/demoData.ts` | Seed data lives in code. Move to `prisma seed` when DB lands. |
| Activity | `src/components/ActivityTicker.tsx` | Turn off `SYNTHETIC_EVENTS` for prod. |
| Block counter | `src/components/StatusBar.tsx` | Replace `setBlock((b) => b + Math.floor(Math.random() * 3) + 1)` with `useBlockNumber()` from wagmi. |
| Fund enforcement | `src/app/profile/page.tsx` `FundingPanel` + `server/mcp.ts` | Add an envelope check in MCP tool handlers. |
| Naming | `src/app/orchestrate/page.tsx`, `src/components/Header.tsx`, API routes `/api/orchestrate` | Pick one name (planner / orchestrator / router) and rename everywhere. |

---

## 6. Quick-start for the next agent

```bash
# one terminal
npm run dev:server --prefix swarm  # Express API on 4021

# another terminal
npm run dev:next --prefix swarm    # Next.js on 3000

# optional, for demoing cross-device
ngrok http 4021                    # public URL to your local API
# then set SWARM_API_URL=<ngrok-url> in friend's Claude Desktop MCP config
```

Env vars (in `swarm/.env`):
```
GEMINI_API_KEY=...                # required for callAgent() to work
ORCHESTRATOR_PRIVATE_KEY=...       # required for ERC-8004 writes
ORCHESTRATOR_ADDRESS=...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...  # for mobile wallet support
```

MCP config (Claude Desktop `~/.claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "swarm": {
      "command": "npm",
      "args": ["run", "mcp", "--prefix", "/ABSOLUTE/PATH/TO/cryptathon/swarm"],
      "env": { "SWARM_API_URL": "http://localhost:4021" }
    }
  }
}
```

---

## 7. Open decisions the user should make

Things I couldn't decide for you:

1. **Name of the orchestrator flow**: planner / router / dispatcher / composer / workflow. Current code uses both "orchestrator" and "planner".
2. **Auth model**: wallet-only via SIWE (pure), or wallet + email (broader)?
3. **Pricing model scope**: ship per-call flat only, or also ship tiered + per-token before launch?
4. **Where ERC-8004 registration should live**: manual admin endpoint (current), auto on first call, or a "Register on-chain" button in Profile?
5. **Synthetic activity events on or off in production?** Off feels honest, on feels alive. I'd default to off for prod and on for a staging-demo env behind a flag.
6. **Whether to pre-seed human experts** in production. Current `demoAgentSeeds` includes people who don't exist. Either leave them as clearly-labeled demo placeholders or wipe them and only show real applied experts.

---

## 8. Things I'd not change

Some instincts to protect against future pressure:

- **Keep the terminal aesthetic.** Sharp corners, mono type, inverse-hover table rows, status bar chrome. It's the brand now.
- **Keep the MCP-first stance.** The web UI is a demo / fallback. Design decisions should prioritize what's callable over MCP.
- **Keep the agent table dense.** Don't let a PM turn it into a card grid.
- **Keep the `/connect` page live-wired**. Don't let it regress to static docs.
- **Keep the boot splash short** (≤1.5s perceived). It shouldn't annoy.

---

Made it this far? Good. Ship tier 1, then talk to 3 real users before committing to anything in tier 3.
