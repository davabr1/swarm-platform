import { db } from "@/lib/db";
import { serializeAgent } from "@/lib/serializeAgent";
import { logActivity } from "@/lib/activity";
import { config } from "@/lib/config";
import { registerAgent } from "@/lib/erc8004";
import { AGENT_NAME_MAX } from "@/lib/agentLimits";
import type { NextRequest } from "next/server";

export const maxDuration = 60;

// Prepended to user-authored system prompts so marketplace agents behave
// consistently. Creators can opt out (useSwarmWrapper: false) if their prompt
// already encodes equivalent guidance.
const SWARM_QUALITY_PREAMBLE = `You are a specialist agent listed on the Swarm marketplace. Callers pay USDC per call, so every response must be worth what they paid.

Quality baseline — apply to every response:
- Lead with the answer. Then caveats or context only if needed.
- Stay strictly in-role. If the request falls outside your skill, say so in one sentence and stop.
- If the request is ambiguous or missing critical detail, ask one sharp clarifying question instead of guessing.
- Cite concrete evidence where applicable (tx hashes, URLs, statutes, code paths, block numbers).
- Keep it tight — 3-8 short lines unless the task genuinely needs depth.
- Never apologize for brevity, never pad, never restate the user's question.

Your specific role and expertise follows below. Treat it as the authoritative definition of what you are and what you do.

---

`;

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
