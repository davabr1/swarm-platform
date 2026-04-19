// Backfill / rewrite for the Swarm quality preamble. Three passes:
//
//   1. Image agents never get the preamble (the copy is text-response
//      guidance). If one somehow has it (from an earlier backfill), strip it.
//
//   2. Text / skill / human rows whose systemPrompt does NOT start with the
//      anchor get the current `SWARM_QUALITY_PREAMBLE` prepended. This
//      backfills every platform agent (seed.ts historically didn't prepend)
//      plus any user-created row that slipped through with the wrapper off.
//
//   3. Rows that already carry an older preamble containing the now-retired
//      "3-8 short lines" line get that one line swapped for the current
//      "calibrate length" copy in place.
//
// Idempotent — rerunning is safe.
//
// Usage: `cd swarm && npx tsx scripts/rewrite-preamble.ts`

import { PrismaClient } from "@prisma/client";
import { SWARM_QUALITY_PREAMBLE, SWARM_PREAMBLE_ANCHOR } from "../src/lib/swarmPreamble";

// Image agents are identified by skill prefix — same signal as
// `getCategory()` in src/lib/agentCategory.ts.
function isImageAgent(skill: string | null): boolean {
  return !!skill && skill.startsWith("Image");
}

const OLD_LINE = "- Keep it tight — 3-8 short lines unless the task genuinely needs depth.";
const NEW_LINE =
  "- Calibrate length to the question — concise when you can, thorough when the user needs the reasoning. Never pad to look thorough.";

const db = new PrismaClient();

async function main() {
  const all = await db.agent.findMany({
    select: { id: true, name: true, skill: true, systemPrompt: true },
  });

  let prepended = 0;
  let stripped = 0;
  let rewritten = 0;

  for (const r of all) {
    if (!r.systemPrompt) continue;
    let prompt = r.systemPrompt;
    let changed = false;

    if (isImageAgent(r.skill)) {
      if (prompt.startsWith(SWARM_PREAMBLE_ANCHOR)) {
        const body = prompt.slice(SWARM_QUALITY_PREAMBLE.length);
        prompt = body.startsWith(SWARM_PREAMBLE_ANCHOR) ? body : body.replace(/^\s+/, "");
        if (prompt !== r.systemPrompt) {
          changed = true;
          stripped++;
          console.log(`  − strip   · ${r.id} · ${r.name}`);
        }
      }
    } else if (!prompt.startsWith(SWARM_PREAMBLE_ANCHOR)) {
      prompt = SWARM_QUALITY_PREAMBLE + prompt;
      changed = true;
      prepended++;
      console.log(`  + prepend · ${r.id} · ${r.name}`);
    } else if (prompt.includes(OLD_LINE)) {
      prompt = prompt.split(OLD_LINE).join(NEW_LINE);
      changed = true;
      rewritten++;
      console.log(`  ~ rewrite · ${r.id} · ${r.name}`);
    }

    if (changed) {
      await db.agent.update({ where: { id: r.id }, data: { systemPrompt: prompt } });
    }
  }

  console.log(
    `done — scanned ${all.length} rows, prepended ${prepended}, stripped from image agents ${stripped}, rewrote old line ${rewritten}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
