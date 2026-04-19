-- Hourly sweep of expired, unclaimed tasks → auto-refund to poster.
--
-- The Swarm `Task.expiresAt` column (migration 20260419120000) is set 7d
-- out on every POST /api/tasks. The Next.js handler at
-- /api/cron/expire-tasks scans open tasks past that timestamp, calls
-- refundBounty() (treasuryTransfer → poster), and flips the row to
-- "cancelled". It's idempotent — re-running on an already-swept set is a
-- no-op.
--
-- This file is the Supabase side: a pg_cron job that HTTPS-calls the
-- endpoint every hour. Paste into the Supabase SQL editor once.
--
-- Docs:
--   pg_cron  · https://supabase.com/docs/guides/database/extensions/pg_cron
--   pg_net   · https://supabase.com/docs/guides/database/extensions/pg_net

-- 1) Enable the extensions (idempotent).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Schedule the hourly sweep.
--
-- Replace <YOUR_PRODUCTION_DOMAIN> with your live origin (e.g.
-- swarm.example.com). If you'd rather gate the endpoint with a shared
-- secret, set CRON_SECRET in Vercel env AND paste the same value below;
-- the route accepts `Authorization: Bearer <secret>`. To leave the
-- endpoint open (the sweep is idempotent, so this is defensible), drop
-- the `headers` argument entirely.

select cron.schedule(
  'swarm-expire-tasks-hourly',
  '0 * * * *',
  $$
    select net.http_post(
      url     := 'https://<YOUR_PRODUCTION_DOMAIN>/api/cron/expire-tasks',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <CRON_SECRET_MATCHING_VERCEL_ENV>',
        'Content-Type',  'application/json'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- --- management snippets ----------------------------------------------------

-- List scheduled jobs:
--   select jobid, jobname, schedule, command from cron.job;

-- See recent runs + HTTP responses:
--   select * from cron.job_run_details where jobname = 'swarm-expire-tasks-hourly'
--     order by start_time desc limit 20;
--   select id, status_code, content from net._http_response
--     order by created desc limit 20;

-- Unschedule:
--   select cron.unschedule('swarm-expire-tasks-hourly');
