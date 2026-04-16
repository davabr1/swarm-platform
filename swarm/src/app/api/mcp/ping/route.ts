import { db } from "@/lib/db";

export async function POST() {
  const start = Date.now();
  const agentCount = await db.agent.count();
  const latencyMs = Date.now() - start;
  return Response.json({ ok: true, latencyMs, agentCount, tool: "swarm_list_agents" });
}
