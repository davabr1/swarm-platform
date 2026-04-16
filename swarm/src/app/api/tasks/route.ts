import { db } from "@/lib/db";
import { serializeTask } from "@/lib/serializeAgent";
import { logActivity } from "@/lib/activity";
import type { NextRequest } from "next/server";

export async function GET() {
  const tasks = await db.task.findMany({ orderBy: { createdAt: "desc" } });
  return Response.json(tasks.map((t) => serializeTask(t)));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { description, bounty, skill, postedBy, payload } = body;
  if (!description || !bounty || !skill) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const id = `task_${Date.now()}`;
  const task = await db.task.create({
    data: {
      id,
      description,
      bounty,
      skill,
      payload: typeof payload === "string" && payload.length ? payload : null,
      status: "open",
      postedBy: postedBy || "orchestrator",
    },
  });

  await logActivity("task", `New task posted: "${String(description).slice(0, 50)}..." — ${bounty} USDC bounty`);

  // The poster is shown their own payload in the response — only the public
  // list view hides it.
  return Response.json(serializeTask(task, { revealPayload: true }));
}
