import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const rows = await db.$queryRaw<Array<{ agentId: string; n: bigint }>>`
    SELECT "agentId", COUNT(*)::bigint AS n
      FROM "Agent"
     WHERE "agentId" IS NOT NULL
     GROUP BY "agentId"
    HAVING COUNT(*) > 1
  `;
  if (rows.length === 0) {
    console.log("no duplicate agentId values — safe to apply unique constraint");
  } else {
    console.log("duplicates found:", rows);
  }
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
