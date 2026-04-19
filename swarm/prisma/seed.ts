import { PrismaClient } from "@prisma/client";
import { config } from "../src/lib/config";
import { demoAgentSeeds, demoActivitySeeds, demoMetricsById } from "../src/lib/demoData";
import { SWARM_QUALITY_PREAMBLE, SWARM_PREAMBLE_ANCHOR } from "../src/lib/swarmPreamble";

const db = new PrismaClient();

// Every seeded agent gets the Swarm quality preamble baked into its
// systemPrompt row, matching the behavior of user-created agents in
// `/api/agents/create`. Guarded so re-seeding doesn't double-prepend.
function withPreamble(prompt: string): string {
  return prompt.startsWith(SWARM_PREAMBLE_ANCHOR) ? prompt : SWARM_QUALITY_PREAMBLE + prompt;
}

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
    const systemPrompt = withPreamble(cfg.systemPrompt);
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
        systemPrompt,
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
        systemPrompt,
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
    { cfg: config.imageAgents.lumen, reputation: 0, ratings: 0, totalCalls: 0 },
    { cfg: config.imageAgents.plushie, reputation: 0, ratings: 0, totalCalls: 0 },
    { cfg: config.imageAgents.inkwell, reputation: 0, ratings: 0, totalCalls: 0 },
    { cfg: config.imageAgents.pastel, reputation: 0, ratings: 0, totalCalls: 0 },
    { cfg: config.imageAgents.bitforge, reputation: 0, ratings: 0, totalCalls: 0 },
    { cfg: config.imageAgents.claywork, reputation: 0, ratings: 0, totalCalls: 0 },
    { cfg: config.imageAgents.atelier, reputation: 0, ratings: 0, totalCalls: 0 },
    { cfg: config.imageAgents.neonoir, reputation: 0, ratings: 0, totalCalls: 0 },
  ];

  // Image agents don't get the quality preamble — that copy is text-response
  // guidance (lead with the answer, cite evidence, etc.) and Gemini's image
  // model ignores system prompts for tone anyway.
  for (const { cfg, reputation, ratings, totalCalls } of imageAgentSeeds) {
    const systemPrompt = cfg.systemPrompt;
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
        systemPrompt,
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
        systemPrompt,
        type: "ai",
        pricingNote: `Flat rate per image · ${cfg.model}`,
      },
    });
  }

  // No seeded human listing. Humans onboard through /become — the Agent row
  // for a human is created when they submit that form with `type: "human_expert"`.

  // Demo agents (specialized AI only — no seeded humans).
  // Every demo agent is PLATFORM-made, so we override `demoAddress(N)` in the
  // seed data with the shared platform receiving wallet. The per-agent
  // address/creatorAddress fields in demoData.ts exist only so the type is
  // closed — they're never the recipient of real USDC.
  const platformWallet = config.platformAgentAddress;
  for (const seed of demoAgentSeeds) {
    const systemPrompt = withPreamble(seed.systemPrompt);
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
        systemPrompt,
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
        systemPrompt,
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
