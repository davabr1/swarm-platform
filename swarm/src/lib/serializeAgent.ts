import type { Agent } from "@prisma/client";
import { formatPrice } from "./geminiPricing";

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
  // Platform-owned agents don't charge a commission — the platform already
  // keeps the 5% margin on every call, so adding a second cut would be
  // double-dipping. Third-party (user-created) agents keep their posted
  // price as their commission. The billing routes apply the same rule via
  // `agent.userCreated ? parsePrice(agent.price) : 0`, so the displayed
  // price here stays consistent with what the user is actually charged.
  const displayPrice = a.userCreated ? formatPrice(a.price) : "0 USDC";
  return {
    id: a.id,
    name: a.name,
    skill: a.skill,
    description: a.description,
    price: displayPrice,
    address: a.walletAddress,
    creatorAddress: a.creatorAddress ?? a.walletAddress,
    type: a.type,
    userCreated: a.userCreated,
    reputation: { count: a.ratingsCount, averageScore: a.reputation },
    totalCalls: a.totalCalls,
    agentId: a.agentId ?? undefined,
    pricingModel: (a.pricingModel as PricingModel) ?? defaults.pricingModel,
    pricingNote: a.pricingNote ?? defaults.pricingNote,
  };
}

export function serializeTask(
  t: {
    id: string;
    description: string;
    bounty: string;
    bountyMicroUsd?: bigint;
    skill: string;
    payload: string | null;
    status: string;
    postedBy: string | null;
    claimedBy: string | null;
    result: string | null;
    assignedTo: string | null;
    requiredSkill: string | null;
    minReputation: number | null;
    visibility: string;
    posterRating: number | null;
    posterRatedAt: Date | null;
    payoutTxHash?: string | null;
    payoutBlockNumber?: number | null;
    cancelledAt?: Date | null;
    createdAt: Date;
    claimedAt: Date | null;
    completedAt: Date | null;
  },
  opts: { viewerAddress?: string } = {}
) {
  const viewer = opts.viewerAddress?.toLowerCase();
  const poster = t.postedBy?.toLowerCase();
  const claimer = t.claimedBy?.toLowerCase();
  const isPublic = t.visibility === "public" && t.status !== "open";
  const canSeePrivate = !!viewer && (viewer === poster || viewer === claimer);
  const reveal = canSeePrivate || isPublic;

  return {
    id: t.id,
    description: t.description,
    bounty: formatPrice(t.bounty),
    skill: t.skill,
    payload: reveal ? t.payload ?? undefined : undefined,
    hasPayload: !!t.payload,
    status: t.status,
    postedBy: t.postedBy ?? "orchestrator",
    claimedBy: t.claimedBy ?? undefined,
    result: reveal ? t.result ?? undefined : undefined,
    hasResult: !!t.result,
    assignedTo: t.assignedTo ?? undefined,
    requiredSkill: t.requiredSkill ?? undefined,
    minReputation: t.minReputation ?? undefined,
    visibility: t.visibility,
    posterRating: t.posterRating ?? undefined,
    posterRatedAt: t.posterRatedAt ? t.posterRatedAt.getTime() : undefined,
    payoutTxHash: t.payoutTxHash ?? undefined,
    payoutBlockNumber: t.payoutBlockNumber ?? undefined,
    cancelledAt: t.cancelledAt ? t.cancelledAt.getTime() : undefined,
    createdAt: t.createdAt.getTime(),
    claimedAt: t.claimedAt ? t.claimedAt.getTime() : undefined,
    completedAt: t.completedAt ? t.completedAt.getTime() : undefined,
  };
}
