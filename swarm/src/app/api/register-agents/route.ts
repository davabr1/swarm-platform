import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { registerAgent } from "@/lib/erc8004";
import { logActivity } from "@/lib/activity";

export const maxDuration = 60;

export async function POST() {
  const agents = await db.agent.findMany();
  const results: Record<string, string> = {};

  for (const agent of agents) {
    if (agent.agentId) {
      results[agent.id] = `Already registered (agentId: ${agent.agentId})`;
      continue;
    }

    try {
      const agentURI = JSON.stringify({
        name: agent.name,
        skill: agent.skill,
        description: agent.description,
        price: agent.price,
        type: agent.type,
      });

      const agentId = await registerAgent(config.orchestrator.privateKey, agentURI);
      const idStr = agentId.toString();
      await db.agent.update({ where: { id: agent.id }, data: { agentId: idStr } });
      results[agent.id] = `Registered with agentId: ${idStr}`;
      await logActivity("registration", `${agent.name} registered on ERC-8004 — agentId: ${idStr}`);
    } catch (err) {
      results[agent.id] = `Failed: ${err instanceof Error ? err.message : "Unknown error"}`;
    }
  }

  return Response.json(results);
}
