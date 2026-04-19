import type { Agent } from "@prisma/client";
import { formatPrice, formatUsd, parsePrice } from "./geminiPricing";

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

// Rough "what will the caller actually pay" estimate. Matches the settle
// math at `src/app/api/image/route.ts:90–103` and `src/app/api/ask/route.ts`:
//   total = commission + geminiCost + 5% platformFee
// Commission is zero on platform-owned rows. Gemini cost is approximated
// from the agent's skill (images charge per-image flat; conversational
// charges per-token). The settled `breakdown.totalUsd` on each call is
// still the authoritative figure — this is the upfront ballpark that Claude
// should quote so the user isn't surprised when the real charge lands.
function estCostPerCallUsd(a: Agent): number {
  if (a.type === "human_expert") return parsePrice(a.price);
  const commission = a.userCreated ? parsePrice(a.price) : 0;
  const isImage = a.skill.toLowerCase().startsWith("image");
  // Image agents are pinned to Nano Banana 2 (Flash) by default at ~$0.04/img;
  // Pro rows would run ~$0.134 but are rare. Conversational averages ~500
  // prompt + 200 output + 100 thoughts tokens at Gemini 3.1 Pro rates.
  const geminiTypical = isImage ? 0.04 : 0.005;
  const pre = commission + geminiTypical;
  const platformFee = pre * 0.05;
  return Math.round((pre + platformFee) * 10_000) / 10_000;
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
    estCostPerCallUsd: formatUsd(estCostPerCallUsd(a)),
    address: a.walletAddress,
    creatorAddress: a.creatorAddress ?? a.walletAddress,
    type: a.type,
    userCreated: a.userCreated,
    // Legacy human_expert rows predate the roles column — expose ["expert"]
    // so the UI can keep treating them as claim-capable specialists.
    roles:
      a.roles && a.roles.length > 0
        ? a.roles
        : a.type === "human_expert"
          ? ["expert"]
          : [],
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
    resultAttachment?: string | null;
    resultAttachmentType?: string | null;
    assignedTo: string | null;
    requiredSkill: string | null;
    minReputation: number | null;
    expertOnly?: boolean;
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
    // Big blob only ships when the viewer is authorized AND the task was
    // fetched with the full scalar select. List-view queries use
    // TASK_LIST_SELECT which omits the blob but keeps the type, so
    // `hasResultAttachment` still reports correctly.
    resultAttachment: reveal ? t.resultAttachment ?? undefined : undefined,
    resultAttachmentType: t.resultAttachmentType ?? undefined,
    hasResultAttachment: !!t.resultAttachmentType,
    assignedTo: t.assignedTo ?? undefined,
    requiredSkill: t.requiredSkill ?? undefined,
    minReputation: t.minReputation ?? undefined,
    expertOnly: t.expertOnly ?? false,
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
