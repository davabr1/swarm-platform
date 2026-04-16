import type { Agent } from "@prisma/client";

export type PricingModel = "flat" | "tiered" | "per_token" | "per_minute";

export function pricingDefaultsFor(
  skill: string,
  type: string
): { pricingModel: PricingModel; pricingNote: string } {
  const s = skill.toLowerCase();
  if (type === "human_expert") {
    return { pricingModel: "flat", pricingNote: "Flat per-task bounty. Extended scope = new task." };
  }
  if (s.includes("forensics") || s.includes("mev")) {
    return { pricingModel: "tiered", pricingNote: "Base price covers up to 10 hops / 50 blocks; +20% per additional tier." };
  }
  if (s.includes("exploit") || s.includes("audit") || s.includes("circuit") || s.includes("verification")) {
    return { pricingModel: "tiered", pricingNote: "Base price covers up to 200 LOC; long contracts quoted in scope tiers." };
  }
  if (s.includes("summar") || s.includes("research") || s.includes("governance") || s.includes("compliance") || s.includes("regulatory")) {
    return { pricingModel: "per_token", pricingNote: "Per 1k input tokens; output capped at 2k tokens per call." };
  }
  if (s.includes("incident") || s.includes("runtime") || s.includes("triage")) {
    return { pricingModel: "per_minute", pricingNote: "Streamed per minute of monitoring or response session." };
  }
  return { pricingModel: "flat", pricingNote: "Flat rate per call — no overage." };
}

export function serializeAgent(a: Agent) {
  const defaults = pricingDefaultsFor(a.skill, a.type);
  return {
    id: a.id,
    name: a.name,
    skill: a.skill,
    description: a.description,
    price: a.price,
    address: a.walletAddress,
    creatorAddress: a.creatorAddress ?? a.walletAddress,
    type: a.type,
    reputation: { count: a.ratingsCount, averageScore: a.reputation },
    totalCalls: a.totalCalls,
    agentId: a.agentId ?? undefined,
    pricingModel: (a.pricingModel as PricingModel) ?? defaults.pricingModel,
    pricingNote: a.pricingNote ?? defaults.pricingNote,
  };
}

export function serializeTask(t: {
  id: string;
  description: string;
  bounty: string;
  skill: string;
  status: string;
  postedBy: string | null;
  claimedBy: string | null;
  result: string | null;
  createdAt: Date;
}) {
  return {
    id: t.id,
    description: t.description,
    bounty: t.bounty,
    skill: t.skill,
    status: t.status,
    postedBy: t.postedBy ?? "orchestrator",
    claimedBy: t.claimedBy ?? undefined,
    result: t.result ?? undefined,
    createdAt: t.createdAt.getTime(),
  };
}
