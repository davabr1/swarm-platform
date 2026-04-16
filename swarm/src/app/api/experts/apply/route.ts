import { db } from "@/lib/db";
import { serializeAgent } from "@/lib/serializeAgent";
import { logActivity } from "@/lib/activity";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, skill, description, rate, walletAddress } = body;
  if (!name || !skill || !description || !rate || !walletAddress) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const existingExperts = await db.agent.findMany({ where: { type: "human_expert" } });
  const normalized = String(walletAddress).toLowerCase();
  const existing = existingExperts.find((a) => a.walletAddress.toLowerCase() === normalized);
  if (existing) {
    return Response.json(
      { error: "An expert profile already exists for this wallet address", agent: serializeAgent(existing) },
      { status: 409 }
    );
  }

  const id = `expert_${Date.now()}`;
  const expert = await db.agent.create({
    data: {
      id,
      name,
      skill,
      description,
      price: `$${rate}/task`,
      walletAddress,
      creatorAddress: walletAddress,
      systemPrompt: "",
      type: "human_expert",
      userCreated: true,
    },
  });

  await logActivity("registration", `New human expert "${name}" applied with wallet ${String(walletAddress).slice(0, 8)}...`);
  return new Response(JSON.stringify(serializeAgent(expert)), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
