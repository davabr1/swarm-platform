import { db } from "@/lib/db";
import { serializeTask } from "@/lib/serializeAgent";
import { logActivity } from "@/lib/activity";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const viewer = req.nextUrl.searchParams.get("viewer") ?? undefined;
  const inbox = req.nextUrl.searchParams.get("inbox") === "1";
  const tasks = await db.task.findMany({ orderBy: { createdAt: "desc" } });

  if (inbox && viewer) {
    const vLower = viewer.toLowerCase();
    const myAgents = await db.agent.findMany({
      where: { creatorAddress: { equals: viewer, mode: "insensitive" } },
      select: { skill: true, reputation: true },
    });
    const mySkills = new Set(myAgents.map((a) => a.skill.toLowerCase()));
    const bestRep = myAgents.reduce((m, a) => Math.max(m, a.reputation ?? 0), 0);
    const matching = tasks.filter((t) => {
      if (t.status !== "open") return false;
      if (t.assignedTo && t.assignedTo.toLowerCase() === vLower) return true;
      if (
        t.requiredSkill &&
        mySkills.has(t.requiredSkill.toLowerCase()) &&
        (t.minReputation == null || bestRep >= t.minReputation)
      ) {
        return true;
      }
      return false;
    });
    return Response.json(matching.map((t) => serializeTask(t, { viewerAddress: viewer })));
  }

  return Response.json(tasks.map((t) => serializeTask(t, { viewerAddress: viewer })));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    description,
    bounty,
    skill,
    postedBy,
    payload,
    assignedTo,
    requiredSkill,
    minReputation,
    visibility,
  } = body;
  if (!description || !bounty || !skill) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const id = `task_${Date.now()}`;
  const vis = visibility === "public" ? "public" : "private";
  const task = await db.task.create({
    data: {
      id,
      description,
      bounty,
      skill,
      payload: typeof payload === "string" && payload.length ? payload : null,
      status: "open",
      postedBy: postedBy || "orchestrator",
      assignedTo: typeof assignedTo === "string" && assignedTo.length ? assignedTo : null,
      requiredSkill:
        typeof requiredSkill === "string" && requiredSkill.length ? requiredSkill : null,
      minReputation:
        typeof minReputation === "number" && !Number.isNaN(minReputation) ? minReputation : null,
      visibility: vis,
    },
  });

  await logActivity("task", `New task posted: "${String(description).slice(0, 50)}..." — ${bounty} USDC bounty`);

  return Response.json(serializeTask(task, { viewerAddress: postedBy }));
}
