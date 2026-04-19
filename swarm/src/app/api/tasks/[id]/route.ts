import { db } from "@/lib/db";
import { serializeTask } from "@/lib/serializeAgent";
import { resolveAgentAddress } from "@/lib/session";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params;
  // Browser sends ?viewer=; MCP attaches X-Asker-Address. Without either the
  // viewer can't be identified and result/payload stay redacted — which is
  // what hit 0.14.x clients that never passed ?viewer= and made the server
  // drop the task body.
  const viewer =
    req.nextUrl.searchParams.get("viewer") ?? resolveAgentAddress(req) ?? undefined;
  const task = await db.task.findUnique({ where: { id } });
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
  return Response.json(serializeTask(task, { viewerAddress: viewer }));
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const viewer = (req.nextUrl.searchParams.get("viewer") ?? body.viewer ?? "").toLowerCase();
  const task = await db.task.findUnique({ where: { id } });
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });

  const poster = task.postedBy?.toLowerCase();
  const claimer = task.claimedBy?.toLowerCase();
  if (!viewer || (viewer !== poster && viewer !== claimer)) {
    return Response.json({ error: "Only poster or claimer can update this task" }, { status: 403 });
  }

  const data: { visibility?: string } = {};
  if (body.visibility === "public" || body.visibility === "private") {
    data.visibility = body.visibility;
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await db.task.update({ where: { id }, data });
  return Response.json(serializeTask(updated, { viewerAddress: viewer }));
}
