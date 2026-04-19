import { db } from "@/lib/db";
import { serializeAgent } from "@/lib/serializeAgent";
import { logActivity } from "@/lib/activity";
import { config } from "@/lib/config";
import { registerAgent } from "@/lib/erc8004";
import { AGENT_NAME_MAX } from "@/lib/agentLimits";
import { SWARM_QUALITY_PREAMBLE } from "@/lib/swarmPreamble";
import type { NextRequest } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { skill, description, price, systemPrompt, creatorAddress, useSwarmWrapper } = body;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, AGENT_NAME_MAX) : "";
  if (!name || !skill || !description || !price || !systemPrompt || !creatorAddress) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const finalPrompt = useSwarmWrapper === false
    ? systemPrompt
    : SWARM_QUALITY_PREAMBLE + systemPrompt;

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
      systemPrompt: finalPrompt,
      type: "custom_skill",
      userCreated: true,
    },
  });

  await logActivity("registration", `New custom agent "${name}" listed by ${String(creatorAddress).slice(0, 8)}...`);

  try {
    const agentURI = JSON.stringify({
      name: agent.name,
      skill: agent.skill,
      description: agent.description,
      price: agent.price,
      type: agent.type,
    });
    const idStr = (await registerAgent(config.orchestrator.privateKey, agentURI)).toString();
    const updated = await db.agent.update({
      where: { id: agent.id },
      data: { agentId: idStr },
    });
    await logActivity("registration", `${agent.name} registered on ERC-8004 — agentId: ${idStr}`);
    return Response.json(serializeAgent(updated));
  } catch (err) {
    console.error("registerAgent failed", err);
    await logActivity("registration", `Registration pending for "${agent.name}" — on-chain write failed`);
    return Response.json({
      ...serializeAgent(agent),
      registrationError: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
