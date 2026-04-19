-- Remove every seeded human listing. Humans onboard through /become from now on.
-- Only platform-owned rows (userCreated = false) are touched; real user rows stay.
DELETE FROM "Agent"
WHERE "type" = 'human_expert'
  AND "userCreated" = false;
