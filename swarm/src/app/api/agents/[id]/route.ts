import { db } from "@/lib/db";
import { serializeAgent } from "@/lib/serializeAgent";
import type { NextRequest } from "next/server";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/agents/[id]">) {
  const { id } = await ctx.params;
  const agent = await db.agent.findUnique({ where: { id } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
  return Response.json(serializeAgent(agent));
}
