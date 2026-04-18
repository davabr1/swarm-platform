# Swarm launch checklist

Everything that has to happen before the hackathon demo, sorted by blast radius. Top items are hard blockers — nothing real works without them. Bottom items are polish or can wait until after the demo.

---

## 1. Provision the treasury wallet — HARD BLOCKER

Without this, every paid call crashes. The treasury is the EOA that custodies user deposits and signs outgoing USDC payouts. It doesn't exist yet — no `TREASURY_ADDRESS` / `TREASURY_PRIVATE_KEY` in `.env`.

### Steps

1. **Generate a fresh EOA.** Any of:
   - `cast wallet new` (Foundry)
   - `node -e "console.log(require('ethers').Wallet.createRandom())"` in the `swarm/` dir
   - Any wallet app that can export a private key

   Save the private key somewhere secure. Save the public address.

2. **Fund it with AVAX on Fuji** for gas. Use an Avalanche Fuji AVAX faucet (search "Fuji AVAX faucet" — Core, Chainlink, and a few others all work). Aim for ≥0.5 AVAX so you're not topping up mid-demo.

3. **Fund it with test USDC on Fuji.** Either:
   - Use a Fuji USDC faucet, or
   - Send test USDC from a wallet you already have

   Even 10 USDC is fine for the demo.

4. **Add env vars** to `swarm/.env` (local) **and** Vercel project settings (prod):
   ```
   TREASURY_ADDRESS=0x…
   TREASURY_PRIVATE_KEY=0x…
   ```
   Restart the dev server after editing `.env`.

### Verify

- Open `/` in the browser, triple-click the SWARM logo, enter `ADMIN_PASSWORD` (see step 3 below). The treasury block should show your new address + positive USDC + positive AVAX. If it says "not configured," the env vars didn't load.
- Send 1 USDC to the treasury from a separate wallet. Open `/profile` while connected to that wallet — balance should credit within a few seconds.

---

## 2. Set `ADMIN_PASSWORD`

The `/admin` treasury-health page is gated on this. Without it, `/admin` returns `503 admin disabled`.

```bash
# pick anything — it's just for you
echo "ADMIN_PASSWORD=pick-a-password-here" >> swarm/.env
```

Add the same value to Vercel env vars for prod.

### Verify

- Triple-click the SWARM logo anywhere in the site → `/admin` → enter the password → data loads.
- Reload `/admin` → password prompt comes back (no session is kept, by design).

---

## 3. Set `CRON_SECRET` + wire the Supabase pg_cron

This is the free alternative to Vercel Pro. Fires `/api/cron/deposit-scan` every minute from inside Supabase, so deposits credit even if the user never opens the site.

### 3a. Generate the secret

```bash
openssl rand -hex 32
```

Add it to `swarm/.env` and Vercel env vars as `CRON_SECRET=…`. The endpoint returns `503 cron disabled` until this is set.

### 3b. Schedule the job in Supabase

Open the Supabase dashboard → SQL editor → paste and run (replace the two placeholders):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The scheduled SQL reads the secret from a DB-level setting. Store it once:
alter database postgres set app.cron_secret = '<PASTE SAME VALUE AS CRON_SECRET>';

select cron.schedule(
  'swarm-deposit-scan',
  '* * * * *',
  $$
    select net.http_get(
      url := 'https://<YOUR-VERCEL-DOMAIN>/api/cron/deposit-scan',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.cron_secret')
      )
    );
  $$
);
```

### Verify

Wait ~90 seconds after scheduling, then in the Supabase SQL editor:

```sql
select jobid, status, return_message, start_time
  from cron.job_run_details
 where jobname = 'swarm-deposit-scan'
 order by start_time desc limit 5;
```

- `status = 'succeeded'` → good.
- `status = 'failed'` → check `return_message`. Usually it's a wrong URL or a mismatched secret.

To remove later: `select cron.unschedule('swarm-deposit-scan');`

---

## 4. End-to-end Fuji dry run

Once the three steps above are done, do this once start-to-finish. It catches the wiring mistakes type checks can't see.

1. Fresh wallet (MetaMask "create account") with a little Fuji AVAX for gas.
2. Transfer 5 USDC from it → `TREASURY_ADDRESS`.
3. Open `/profile` on that wallet → balance shows 5 USDC within seconds.
4. On the profile page, set autonomous cap to 1 USDC.
5. In `/marketplace`, pay a manual call to any agent → receipt shows a Snowtrace link, balance drops.
6. Pair the MCP (`/configure` → print code → browser claims) → call an autonomous tool → works.
7. Hit an autonomous tool enough times to bust the 1-USDC cap → expect `402` with a "cap exceeded" body.
8. Raise cap on `/profile` → retry → works again.
9. On a separate creator wallet, confirm commission earnings landed (Snowtrace + `/profile` transaction list).
10. Post a task with a bounty → claim from a second wallet → submit → treasury pays the claimer (Snowtrace proof).
11. Post another task → cancel before anyone claims → bounty refunds to the poster.

If any step fails, **do not demo** — file a bug in a scratchpad and fix it first.

---

## 5. Harden the manual-session cookie

Current state: 24-hour httpOnly cookie with `SameSite=Strict`, signed with `MANUAL_SESSION_SECRET`. Fine for a hackathon, loose for production.

Pick the hardening moves that make sense; they stack:

- **Add `Secure` flag** — cookie only travels over HTTPS. Always on in prod; gate on `process.env.NODE_ENV === "production"` so local dev over HTTP still works.
- **Shorten TTL** to 2–4 hours. 24h is generous. Re-signing once a morning is not painful.
- **Rotate on use** — every authenticated response re-issues a fresh cookie with a new `iat` timestamp. Stolen cookie ages out fast.
- **Bind to user-agent** — store a SHA256 of the UA string in the cookie payload, refuse mismatched UAs. Catches naive cookie theft.

Do this AFTER the treasury-info verification step lands — you explicitly flagged it as "after treasury."

File to edit: `swarm/src/lib/manualSession.ts`. No schema changes.

---

## Explicitly deferred (not shipping for hackathon)

Ack'd already — do NOT let scope creep pull these in before the demo:

- **Withdraw flow.** Deposits are one-way today. Fine.
- **Batch commission payouts.** Today every paid call does two `USDC.transfer`s (commission + creator). Cheap on Fuji, expensive at scale. A batch settlement job is the eventual fix, not today.
- **Treasury → multisig or vault.** A single env-held key secures user funds today. Untenable in production, fine for a hackathon judged on functionality.

---

## Quick reference — env vars that must be set

| Var | Where | Purpose |
|---|---|---|
| `TREASURY_ADDRESS` | `.env` + Vercel | Public address receiving user deposits |
| `TREASURY_PRIVATE_KEY` | `.env` + Vercel | Signs outgoing USDC payouts |
| `ADMIN_PASSWORD` | `.env` + Vercel | Gates `/admin` treasury-health page |
| `CRON_SECRET` | `.env` + Vercel + Supabase setting | Bearer for `/api/cron/deposit-scan` |

Existing (should already be set — sanity check them): `ORCHESTRATOR_PRIVATE_KEY`, `ORCHESTRATOR_ADDRESS`, `MANUAL_SESSION_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `GOOGLE_API_KEY`, `GCP_PROJECT_ID`.
