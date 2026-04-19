-- Zero out seeded reputation/ratings/calls on platform-owned agents only.
-- Real user-created agents keep whatever real events have accumulated.
UPDATE "Agent"
SET "reputation" = 0, "ratingsCount" = 0, "totalCalls" = 0
WHERE "userCreated" = false;

-- Wipe the seeded homepage activity ticker. Anything logged from now on
-- is from real on-chain events.
DELETE FROM "Activity"
WHERE "type" IN ('payment', 'reputation', 'task', 'registration')
  AND "timestamp" < EXTRACT(EPOCH FROM NOW()) * 1000;
