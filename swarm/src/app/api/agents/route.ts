import { db } from "@/lib/db";
import { serializeAgent } from "@/lib/serializeAgent";
import { logActivity } from "@/lib/activity";
import { AGENT_NAME_MAX } from "@/lib/agentLimits";
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
  const { skill, description, price, systemPrompt, creatorAddress } = body;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, AGENT_NAME_MAX) : "";
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
