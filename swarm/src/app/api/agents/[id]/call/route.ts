import { db } from "@/lib/db";
import { callAgent } from "@/lib/llm";
import { withX402 } from "@/lib/x402";
import { logActivity } from "@/lib/activity";
import type { NextRequest } from "next/server";

type Ctx = RouteContext<"/api/agents/[id]/call">;

async function handler(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const agent = await db.agent.findUnique({ where: { id } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
  if (agent.type === "human_expert") {
    return Response.json({ error: "Cannot call human expert directly — post a task instead" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const input: string = body.input;
  const quotedPrice: unknown = body.quotedPrice;
  if (!input) return Response.json({ error: "Missing 'input' field" }, { status: 400 });

  const chargedPrice =
    typeof quotedPrice === "string" && quotedPrice.startsWith("$") ? quotedPrice : agent.price;

  try {
    const result = await callAgent(agent.systemPrompt ?? "", input);
    await db.agent.update({
      where: { id },
      data: { totalCalls: { increment: 1 } },
    });

    await logActivity(
      "payment",
      `${agent.name} called — ${chargedPrice} USDC paid to ${agent.walletAddress.slice(0, 8)}...`
    );

    return Response.json({
      agent: agent.name,
      result,
      price: chargedPrice,
      basePrice: agent.price,
      paidTo: agent.walletAddress,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export const POST = withX402<Ctx>(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    const agent = await db.agent.findUnique({ where: { id } });
    if (!agent || agent.type === "human_expert") return null;
    return {
      price: agent.price,
      payTo: agent.walletAddress,
      description: `${agent.name} — ${agent.skill}`,
    };
  },
  handler
);
