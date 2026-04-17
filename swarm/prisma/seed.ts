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

  // Image generation agents — Gemini-backed, model pinned per agent.
  const imageAgentSeeds: Array<{
    cfg: (typeof config.imageAgents)[keyof typeof config.imageAgents];
    reputation: number;
    ratings: number;
    totalCalls: number;
  }> = [
    { cfg: config.imageAgents.lumen, reputation: 4.9, ratings: 74, totalCalls: 312 },
    { cfg: config.imageAgents.plushie, reputation: 4.8, ratings: 102, totalCalls: 628 },
    { cfg: config.imageAgents.inkwell, reputation: 4.7, ratings: 88, totalCalls: 455 },
    { cfg: config.imageAgents.pastel, reputation: 4.8, ratings: 91, totalCalls: 502 },
  ];

  for (const { cfg, reputation, ratings, totalCalls } of imageAgentSeeds) {
    await db.agent.upsert({
      where: { id: cfg.id },
      create: {
        id: cfg.id,
        name: cfg.name,
        skill: cfg.skill,
        description: cfg.description,
        price: cfg.price,
        walletAddress: cfg.address,
        creatorAddress: cfg.address,
        systemPrompt: cfg.systemPrompt,
        type: "ai",
        userCreated: false,
        reputation,
        ratingsCount: ratings,
        totalCalls,
        pricingNote: `Flat rate per image · ${cfg.model}`,
      },
      update: {
        name: cfg.name,
        skill: cfg.skill,
        description: cfg.description,
        price: cfg.price,
        walletAddress: cfg.address,
        creatorAddress: cfg.address,
        systemPrompt: cfg.systemPrompt,
        type: "ai",
        pricingNote: `Flat rate per image · ${cfg.model}`,
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

  // Demo agents (specialized AI + human experts listed in demoData.ts)
  for (const seed of demoAgentSeeds) {
    await db.agent.upsert({
      where: { id: seed.id },
      create: {
        id: seed.id,
        name: seed.name,
        skill: seed.skill,
        description: seed.description,
        price: seed.price,
        walletAddress: seed.address,
        creatorAddress: seed.creatorAddress,
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
        walletAddress: seed.address,
        creatorAddress: seed.creatorAddress,
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
