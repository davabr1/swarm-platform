-- Dual-role humans: an Agent row with type='human_expert' can now hold
-- any non-empty subset of {expert, completer}. Empty array for AI/custom-
-- skill rows.
ALTER TABLE "Agent" ADD COLUMN "roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill every existing human_expert row so legacy applicants keep
-- seeing the expert-tier tasks they used to see.
UPDATE "Agent" SET "roles" = ARRAY['expert'] WHERE "type" = 'human_expert';

-- Expert-only task gate: when true, only "expert" claimers pass the claim
-- check. Default false = anyone with the skill (expert or completer).
ALTER TABLE "Task" ADD COLUMN "expertOnly" BOOLEAN NOT NULL DEFAULT false;
