import { db } from "@/lib/db";
import { serializeAgent } from "@/lib/serializeAgent";
import { resolveAgentAddress } from "@/lib/session";
import type { NextRequest } from "next/server";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/agents/[id]">) {
  const { id } = await ctx.params;
  const agent = await db.agent.findUnique({ where: { id } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
  return Response.json(serializeAgent(agent));
}

// Owner-only edit for user-created agents + human listings. Fields allowed:
// name, description, skill, price, roles (for human listings). The rest of
// the row (systemPrompt, reputation, totalCalls) is immutable here — anything
// derivable from usage stays ground-truth from usage, not editable.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/agents/[id]">) {
  const { id } = await ctx.params;
  const caller = resolveAgentAddress(req);
  if (!caller) {
    return Response.json({ error: "missing_x_asker_address" }, { status: 401 });
  }
  const agent = await db.agent.findUnique({ where: { id } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
  if (!agent.userCreated) {
    return Response.json({ error: "Only user-created listings can be edited" }, { status: 403 });
  }
  const owner = (agent.creatorAddress ?? agent.walletAddress).toLowerCase();
  if (owner !== caller) {
    return Response.json({ error: "Only the listing owner can edit" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim().slice(0, 120);
  }
  if (typeof body.description === "string") {
    data.description = body.description.slice(0, 2000);
  }
  if (typeof body.skill === "string" && body.skill.trim()) {
    data.skill = body.skill.trim().slice(0, 80);
  }
  if (typeof body.price === "string" && body.price.trim()) {
    data.price = body.price.trim().slice(0, 40);
  }
  if (Array.isArray(body.roles)) {
    const allowed = new Set(["expert", "completer"]);
    const next = Array.from(
      new Set(
        body.roles.filter(
          (r: unknown): r is string => typeof r === "string" && allowed.has(r),
        ),
      ),
    );
    // A human listing with an empty roles array can no longer claim anything —
    // force at least one role to stay on the row. Use the current value as a
    // floor if the caller sent an empty array.
    if (agent.type === "human_expert" && next.length === 0) {
      return Response.json({ error: "Pick at least one role" }, { status: 400 });
    }
    data.roles = next;
  }
  if (Object.keys(data).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await db.agent.update({ where: { id }, data });
  return Response.json(serializeAgent(updated));
}

// Owner-only delete. We keep the Agent row (don't hard-delete) so historic
// task references, reputation history, and settlement refs stay intact — but
// flip `userCreated=false` and blank `description` so the listing drops off
// public surfaces and the wallet can re-list. Hard-delete would orphan Task
// rows that reference the agent via creator.
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/agents/[id]">) {
  const { id } = await ctx.params;
  const caller = resolveAgentAddress(req);
  if (!caller) {
    return Response.json({ error: "missing_x_asker_address" }, { status: 401 });
  }
  const agent = await db.agent.findUnique({ where: { id } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
  const owner = (agent.creatorAddress ?? agent.walletAddress).toLowerCase();
  if (owner !== caller) {
    return Response.json({ error: "Only the listing owner can delete" }, { status: 403 });
  }

  await db.agent.delete({ where: { id } }).catch(async () => {
    // FK references (e.g., completed Tasks) block hard-delete. Fall back to a
    // soft-retire: clear ownership + mark the row so it stops surfacing.
    await db.agent.update({
      where: { id },
      data: { userCreated: false, description: "", price: "0 USDC", roles: [] },
    });
  });
  return Response.json({ ok: true });
}
