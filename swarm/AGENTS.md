<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## x402 payment model

The site does **not** hold user funds. Every paid route is x402: the server returns `402 Payment Required`, the caller signs an EIP-3009 `transferWithAuthorization`, the x402 facilitator settles USDC peer-to-peer on Fuji (eip155:43113) in ~2s. No deposits, no bearer tokens, no gas for the payer.

- `src/lib/x402.ts` — shared `x402ResourceServer` + `buildPaymentRequirements`. Reads `PLATFORM_PAYOUT_ADDRESS`, `X402_FACILITATOR_URL`, `X402_NETWORK`.
- `src/lib/x402Middleware.ts` — `requireX402Payment(req, { priceResolver, description })`. Returns the 402 Response on first hit; returns `{ payer, settle, recordX402Settlement }` on verified second hit.
- `src/lib/postSettleFanout.ts` — `fanoutSplit({ creator, commissionMicroUsd, settlementTxHash, refType, refId })`. Commission goes out via `treasuryTransfer` after the inbound x402 settle. Non-fatal if it fails — the user already got the service.
- `src/lib/treasury.ts` — `treasuryTransfer(to, microUsdc)`. Outbound-only now: commission fan-out, human-task payouts, task refunds. Never inbound.
- `src/lib/session.ts` — `resolveAgentAddress(req)` reads the non-authenticated `X-Asker-Address` header for attribution on free routes. Paid routes authenticate via the x402 signature itself.
- `src/lib/x402BrowserFetch.ts` + `src/lib/useX402Fetch.ts` — browser marketplace wraps `fetch` with `@x402/fetch::wrapFetchWithPayment`; the wagmi-connected wallet signs per call.

MCP clients hold their own USDC. Pair mints a local secp256k1 keypair in `~/.swarm-mcp/session.json`; the user funds that address directly. Every paid tool call signs x402 with that key via `wrapFetchWithPayment`.

Deprecated (columns/tables retained for non-destructive migration, no reads/writes): `UserProfile.{balanceMicroUsd, autonomousCapUsd, autonomousSpentMicroUsd, autoTopup}`, `Deposit`, `DepositScanCursor`. The `/api/balance` route returns chain-sourced USDC via `ethers.Contract.balanceOf` — no DB read.
