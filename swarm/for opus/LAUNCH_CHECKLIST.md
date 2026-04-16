# Swarm · launch checklist

A dump of every thing that must land before swarm.xyz (or whatever the
domain ends up being) is a product that works through and through, plus
the honest answer on how MCP and `localhost` interact when the site is
published.

---

## What I just fixed

### Wallet connect "needs SDK" errors
The project had `wagmi@3.6.1` installed but RainbowKit 2.x requires
`wagmi@^2.9.0`. That mismatch silently killed every connector except the
injected one (MetaMask / Rabby). Fix:

- Downgraded wagmi to `2.19.5`
- Installed `@coinbase/wallet-sdk`
- Installed `@walletconnect/ethereum-provider`
- Rewrote `src/lib/wagmi.ts` to use `connectorsForWallets` with MetaMask,
  Rainbow, Coinbase, WalletConnect, and generic injected wallets

All four wallet options should work after a server restart.

### Connect page missed the first-mile
The old version assumed the repo was already cloned and running. Added a
new section `02 · set up swarm locally` with five copy-pastable blocks:

1. `git clone …`
2. `npm install`
3. `cp .env.example .env` with the full annotated env body
4. `npm run dev`
5. paste-your-pwd input

Every platform tab (Claude Desktop, Claude Code, Cursor, Codex, SDK) now
sits below that flow so the page reads top to bottom.

### New / rewritten files
- `.env.example` · full annotated template, no secrets, safe to commit
- `README.md` · rewrote to lead with Prerequisites → Quick start →
  Scripts → Env → Connect → Architecture → Deploying

---

## Honest answer on "localhost + MCP"

Stdio MCP servers run on the caller's machine by design. Claude Desktop,
Cursor, and Codex all spawn the server as a subprocess. So "just visit
swarm.xyz and connect" is **not** how stdio MCP works.

Options when you publish:

1. **Hosted UI + local MCP** · ship the Next.js app to Vercel, the Express
   API to Railway. Users browse agents at swarm.xyz but still `git clone`
   to wire their MCP client to their local copy. Fastest path to public
   beta. The env hook (`NEXT_PUBLIC_SWARM_API_URL`) is already in place
   so the hosted UI can point at the hosted API.

2. **Thin npm package** · publish `@swarm/mcp` that ships only the stdio
   transport and hits the hosted Express API over HTTPS. Users add one
   line to their MCP config:
   ```json
   "command": "npx", "args": ["@swarm/mcp"]
   ```
   No clone, no `.env`. This is the product-grade move.

3. **Remote HTTP / SSE MCP** · serve MCP at `mcp.swarm.xyz/sse`. Modern
   MCP clients accept a URL instead of a spawned subprocess. Cleanest,
   but client coverage is thinner than stdio.

For the cryptathon demo, (1) is enough. For a real launch, build (2).

---

## What I need from you to ship for real

| # | What I need | Why it matters |
|---|---|---|
| 1 | **GitHub URL** for the repo | The README + Connect page currently read `https://github.com/your-org/swarm.git` as a placeholder. Swap it to the real remote so the `git clone` snippets work. |
| 2 | **Deployment target decision** · Vercel for the web app, Railway / Fly / Render for the Express API, or something else | Drives `NEXT_PUBLIC_SWARM_API_URL`, the CORS origins I need to add to Express, and any platform-specific config. |
| 3 | **MCP distribution decision** · option 1, 2, or 3 above | If (2), I scaffold `@swarm/mcp` + publish pipeline. If (3), I add the SSE endpoint to `server/index.ts`. |
| 4 | **Domain** | So CSP, OpenGraph metadata, and the app name shown inside wallet pairing dialogs actually match what users see. |
| 5 | **Confirm the WalletConnect project id in `.env` (`df6dc034…c9a4623`) is yours** and that its allowed origins in the Reown dashboard include your production domain | Otherwise the mobile-wallet QR flow will reject every pairing attempt. |
| 6 | **Rotate the orchestrator private key in `.env`** before going public | It is a real funded Fuji wallet committed to `.env`. `.env` is gitignored so the key is not public, but once the site goes live it signs every demo conductor run. Rotate before any traffic hits. |
| 7 | **Anthropic plan** (optional) | The conductor calls Anthropic on every orchestrate. A personal key is fine for demo traffic; public traffic needs a higher rate limit tier. |

Tell me (1)–(3) and I will wire the rest.

---

## Open items on the code side (I can do these on my own)

- The two pre-existing TypeScript errors in `src/app/profile/page.tsx`
  (`formatted` on wagmi balance, `creatorAddress` on `Agent`) are not
  blocking rendering but will fail a `next build`. Fixable in an hour.
- `server/index.ts` needs CORS tightened once we know the production
  domain. Right now it is permissive for local development.
- The orchestrator system prompt still references agent keys that are
  the *internal* names (`linguaBot`, `codeReviewer`, …). Display-wise it
  is fine because we render the friendly names, but worth cleaning up.

---

## TL;DR for the skeptical reader

- Wallets: four options now, not one. Ready.
- Docs: clone → install → env → run → connect. Ready.
- Deploy: pick an option from §2. Pending you.
- Real money / live traffic: rotate the orchestrator key first. Pending
  you.
