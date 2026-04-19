// Backfill / rewrite for the Swarm quality preamble.
//
// For every row we want the systemPrompt to consist of the CURRENT preamble
// (see src/lib/swarmPreamble.ts) + the role body. To stay idempotent and to
// survive preamble edits (new bullets, re-ordering, etc.) we:
//
//   1. Image agents — strip any preamble they carry (the preamble is text-
//      response guidance; image rows don't need it).
//
//   2. Non-image agents —
//        - If the prompt starts with the anchor sentence, slice off the old
//          preamble block (everything through the first `\n---\n\n` fence
//          that the preamble ends with) and re-prepend the fresh copy.
//        - Otherwise, just prepend.
//
// Idempotent — rerunning with no preamble changes is a no-op on every row
// because the fresh prompt matches the existing one byte-for-byte.
//
// Usage: `cd swarm && npx tsx scripts/rewrite-preamble.ts`

import { PrismaClient } from "@prisma/client";
import { SWARM_QUALITY_PREAMBLE, SWARM_PREAMBLE_ANCHOR } from "../src/lib/swarmPreamble";

// Image agents are identified by skill prefix — same signal as
// `getCategory()` in src/lib/agentCategory.ts.
function isImageAgent(skill: string | null): boolean {
  return !!skill && skill.startsWith("Image");
}

// The preamble ends with a `\n---\n\n` fence separating it from the role
// body. Find it and slice past it to peel off whatever old preamble is
// attached. Returns the role-only body.
function stripPreamble(prompt: string): string {
  if (!prompt.startsWith(SWARM_PREAMBLE_ANCHOR)) return prompt;
  const fence = "\n---\n\n";
  const idx = prompt.indexOf(fence);
  if (idx < 0) return prompt; // no fence found; don't risk mangling
  return prompt.slice(idx + fence.length);
}

const db = new PrismaClient();

async function main() {
  const all = await db.agent.findMany({
    select: { id: true, name: true, skill: true, systemPrompt: true },
  });

  let rewritten = 0;
  let stripped = 0;
  let unchanged = 0;

  for (const r of all) {
    if (!r.systemPrompt) continue;
    const original = r.systemPrompt;
    let next: string;

    if (isImageAgent(r.skill)) {
      next = stripPreamble(original);
      if (next !== original) {
        stripped++;
        console.log(`  − strip   · ${r.id} · ${r.name}`);
      }
    } else {
      const body = stripPreamble(original);
      next = SWARM_QUALITY_PREAMBLE + body;
      if (next !== original) {
        rewritten++;
        console.log(`  ~ rewrite · ${r.id} · ${r.name}`);
      }
    }

    if (next !== original) {
      await db.agent.update({ where: { id: r.id }, data: { systemPrompt: next } });
    } else {
      unchanged++;
    }
  }

  console.log(
    `done — scanned ${all.length} rows, rewrote ${rewritten} text agents, stripped ${stripped} image agents, ${unchanged} unchanged.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
