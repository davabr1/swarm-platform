<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Treasury custody model

The site holds user funds. Users `USDC.transfer(TREASURY_ADDRESS, amount)` on Fuji to top up their `UserProfile.balanceMicroUsd`. Every paid call (autonomous via MCP bearer, or manual via the marketplace browser cookie) debits that balance and is settled by the treasury signing a real `USDC.transfer(treasury → recipient)` on Fuji.

- `src/lib/treasury.ts` — `treasuryTransfer(to, microUsdc)` signs + broadcasts the on-chain move.
- `src/lib/ledger.ts` — `settleFromBalance()` is the single atomic path: conditional balance UPDATE, then on-chain transfer, then `Transaction` ledger insert. Compensates on chain failure.
- `src/lib/depositPoller.ts` — `runDepositScan()` tails `USDC.Transfer(_, treasury)` and credits `UserProfile.balanceMicroUsd`. Triggered on-demand from `/api/balance` and `/api/deposit/*`.
- `src/lib/manualSession.ts` — 24h httpOnly cookie signed with `MANUAL_SESSION_SECRET`. Minted once per wallet via `/api/manual-session` after a single EIP-191 signature; subsequent browser-initiated agent calls travel silently.

The old allowance model (`USDC.approve` + `transferFrom`) is gone. Pair flow only mints an MCP session token now — no on-chain approve step. The only spend cap is `UserProfile.autonomousCapUsd`, enforced globally across all MCP sessions.
