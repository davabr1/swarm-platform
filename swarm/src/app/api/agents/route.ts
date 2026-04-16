import { db } from "@/lib/db";
import { serializeAgent } from "@/lib/serializeAgent";
import { logActivity } from "@/lib/activity";
import type { NextRequest } from "next/server";

export async function GET() {
  const agents = await db.agent.findMany({
    orderBy: [{ reputation: "desc" }, { totalCalls: "desc" }],
  });
  return Response.json(agents.map(serializeAgent));
}

// Create a custom skill agent. Historically POST /api/agents/create; kept for
// compat under that path, and also accepted here.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, skill, description, price, systemPrompt, creatorAddress } = body;
  if (!name || !skill || !description || !price || !systemPrompt || !creatorAddress) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const id = `custom_${Date.now()}`;
  const agent = await db.agent.create({
    data: {
      id,
      name,
      skill,
      description,
      price,
      walletAddress: creatorAddress,
      creatorAddress,
      systemPrompt,
      type: "custom_skill",
      userCreated: true,
    },
  });

  await logActivity("registration", `New custom agent "${name}" listed by ${String(creatorAddress).slice(0, 8)}...`);

  return Response.json(serializeAgent(agent));
}
