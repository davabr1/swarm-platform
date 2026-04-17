import { PrismaClient } from "@prisma/client";
import { config } from "../src/lib/config";
import { demoAgentSeeds, demoActivitySeeds, demoMetricsById } from "../src/lib/demoData";

const db = new PrismaClient();

async function main() {
  // Built-in specialized agents (keys are the historical in-memory ids).
  const builtIns = [
    { key: "linguaBot", cfg: config.agents.linguaBot, type: "ai" },
    { key: "codeReviewer", cfg: config.agents.codeReviewer, type: "ai" },
    { key: "summarizer", cfg: config.agents.summarizer, type: "ai" },
    { key: "solidityAuditor", cfg: config.agents.solidityAuditor, type: "custom_skill" },
  ];

  for (const { key, cfg, type } of builtIns) {
    const metrics = demoMetricsById[key] ?? { reputation: { count: 0, averageScore: 0 }, totalCalls: 0 };
    await db.agent.upsert({
      where: { id: key },
      create: {
        id: key,
        name: cfg.name,
        skill: cfg.skill,
        description: cfg.description,
        price: cfg.price,
        walletAddress: cfg.address,
        creatorAddress: cfg.address,
        systemPrompt: cfg.systemPrompt,
        type,
        userCreated: false,
        reputation: metrics.reputation.averageScore,
        ratingsCount: metrics.reputation.count,
        totalCalls: metrics.totalCalls,
      },
      update: {
        name: cfg.name,
        skill: cfg.skill,
        description: cfg.description,
        price: cfg.price,
        walletAddress: cfg.address,
        creatorAddress: cfg.address,
        systemPrompt: cfg.systemPrompt,
        type,
      },
    });
  }

  // Human expert listing
  const humanMetrics = demoMetricsById.humanExpert ?? { reputation: { count: 0, averageScore: 0 }, totalCalls: 0 };
  await db.agent.upsert({
    where: { id: "humanExpert" },
    create: {
      id: "humanExpert",
      name: "Human Expert",
      skill: "Code Architecture",
      description: "Senior engineer available for architectural decisions and complex problem-solving",
      price: "$0.50/task",
      walletAddress: config.humanExpert.address,
      creatorAddress: config.humanExpert.address,
      systemPrompt: "",
      type: "human_expert",
      userCreated: false,
      reputation: humanMetrics.reputation.averageScore,
      ratingsCount: humanMetrics.reputation.count,
      totalCalls: humanMetrics.totalCalls,
    },
    update: {
      walletAddress: config.humanExpert.address,
      creatorAddress: config.humanExpert.address,
    },
  });

  // Demo agents (specialized AI + human experts listed in demoData.ts).
  // Every demo agent is PLATFORM-made, so we override `demoAddress(N)` in the
  // seed data with the shared platform receiving wallet. The per-agent
  // address/creatorAddress fields in demoData.ts exist only so the type is
  // closed — they're never the recipient of real USDC.
  const platformWallet = config.platformAgentAddress;
  for (const seed of demoAgentSeeds) {
    await db.agent.upsert({
      where: { id: seed.id },
      create: {
        id: seed.id,
        name: seed.name,
        skill: seed.skill,
        description: seed.description,
        price: seed.price,
        walletAddress: platformWallet,
        creatorAddress: platformWallet,
        systemPrompt: seed.systemPrompt,
        type: seed.type,
        userCreated: false,
        reputation: seed.reputation.averageScore,
        ratingsCount: seed.reputation.count,
        totalCalls: seed.totalCalls,
      },
      update: {
        name: seed.name,
        skill: seed.skill,
        description: seed.description,
        price: seed.price,
        walletAddress: platformWallet,
        creatorAddress: platformWallet,
        systemPrompt: seed.systemPrompt,
        type: seed.type,
      },
    });
  }

  // Activity seed — only insert once (no upsert key beyond autoincrement),
  // so skip if any activity already exists.
  const existing = await db.activity.count();
  if (existing === 0) {
    for (const a of demoActivitySeeds) {
      await db.activity.create({
        data: { type: a.type, message: a.message, timestamp: BigInt(a.timestamp) },
      });
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
