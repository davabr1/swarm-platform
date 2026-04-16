import { db } from "@/lib/db";
import { callAgent } from "@/lib/llm";
import { pricingDefaultsFor } from "@/lib/serializeAgent";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/agents/[id]/quote">) {
  const { id } = await ctx.params;
  const agent = await db.agent.findUnique({ where: { id } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
  if (agent.type === "human_expert") {
    return Response.json({ error: "Human experts quote via task board, not direct quote" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const input: string = body.input;
  if (!input) return Response.json({ error: "Missing 'input' field" }, { status: 400 });

  const defaults = pricingDefaultsFor(agent.skill, agent.type);
  const pricingModel = (agent.pricingModel as typeof defaults.pricingModel) ?? defaults.pricingModel;
  const pricingNote = agent.pricingNote ?? defaults.pricingNote;
  const basePrice = agent.price;

  if (pricingModel === "flat") {
    return Response.json({
      basePrice,
      totalPrice: basePrice,
      overage: "$0.00",
      tier: "base",
      scope: "Flat per-call rate. No scope analysis needed.",
      rationale: "This agent charges a flat per-call price regardless of input size.",
      pricingModel,
      pricingNote,
    });
  }

  const quoteSystem = `You are ${agent.name}, a ${agent.skill} specialist. You bill on a "${pricingModel}" model. Base price: ${basePrice}. Pricing note: ${pricingNote}.

A caller is asking you to do a task. Before you do any work, analyze the SCOPE of the request and return a JSON quote. Think about the concrete quantities involved: number of hops to trace, lines of code to review, tokens of content, minutes of monitoring, etc.

Respond with ONLY a JSON object (no other text):
{
  "tier": "base" | "standard" | "deep",
  "scope": "one short sentence describing what you actually counted (e.g., '~27 hops through 3 mixers' or '412 LOC across 2 contracts')",
  "overage": "$0.XX — dollar amount above base price, or $0.00 if base covers it",
  "totalPrice": "$0.XX — the total the caller will be charged",
  "rationale": "one short sentence explaining why the price is what it is"
}

Be honest and conservative. Most short requests fit in the base tier. Only charge overage if the scope truly exceeds what base covers.`;

  try {
    const raw = await callAgent(quoteSystem, input);
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    if (!parsed || typeof parsed !== "object") throw new Error("agent returned no parseable quote");

    return Response.json({
      basePrice,
      totalPrice: parsed.totalPrice ?? basePrice,
      overage: parsed.overage ?? "$0.00",
      tier: parsed.tier ?? "base",
      scope: parsed.scope ?? "scope unclear",
      rationale: parsed.rationale ?? "",
      pricingModel,
      pricingNote,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({
      basePrice,
      totalPrice: basePrice,
      overage: "$0.00",
      tier: "base",
      scope: "scope analysis unavailable — using base rate",
      rationale: `Quote unavailable (${msg}). You'll be charged the base rate.`,
      pricingModel,
      pricingNote,
    });
  }
}
