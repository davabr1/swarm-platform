import { db } from "@/lib/db";
import { serializeTask } from "@/lib/serializeAgent";
import { logActivity } from "@/lib/activity";
import { readManualSession } from "@/lib/manualSession";
import { resolveSession } from "@/lib/session";
import { escrowBounty } from "@/lib/taskEscrow";
import { parsePrice } from "@/lib/geminiPricing";
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

  // Posting a task escrows the bounty from the poster's deposited balance.
  // Accept either the marketplace manual-session cookie OR an MCP Bearer
  // token, so `swarm_post_human_task` works from any paired client.
  const bearer = await resolveSession(req);
  if (bearer.kind === "invalid_token") {
    return Response.json(
      {
        error: "invalid_session",
        reason: bearer.reason,
        message: "Session token invalid or revoked — re-pair.",
      },
      { status: 401 },
    );
  }
  let poster: string | null = null;
  if (bearer.kind === "session") {
    poster = bearer.session.address.toLowerCase();
  } else {
    const manual = await readManualSession();
    if (manual) poster = manual.address.toLowerCase();
  }
  if (!poster) {
    return Response.json(
      { error: "not_authenticated", message: "Sign in with your wallet or pair an MCP client to post tasks." },
      { status: 401 }
    );
  }
  if (typeof postedBy === "string" && postedBy.length && postedBy.toLowerCase() !== poster) {
    return Response.json(
      { error: "address_mismatch", message: "postedBy does not match the authenticated wallet." },
      { status: 403 }
    );
  }

  const bountyUsd = parsePrice(String(bounty));
  if (!(bountyUsd > 0)) {
    return Response.json({ error: "invalid_bounty" }, { status: 400 });
  }
  const bountyMicroUsd = BigInt(Math.round(bountyUsd * 1_000_000));

  const id = `task_${Date.now()}`;
  const escrow = await escrowBounty({
    taskId: id,
    bountyMicroUsd,
    posterAddress: poster,
    description: `Task escrow: ${String(description).slice(0, 80)}`,
  });
  if (!escrow.ok) {
    return Response.json(
      {
        error: escrow.kind,
        message: escrow.message,
      },
      { status: 402 }
    );
  }

  const vis = visibility === "public" ? "public" : "private";
  const task = await db.task.create({
    data: {
      id,
      description,
      bounty,
      bountyMicroUsd,
      escrowTransactionId: escrow.transactionId,
      skill,
      payload: typeof payload === "string" && payload.length ? payload : null,
      status: "open",
      postedBy: poster,
      assignedTo: typeof assignedTo === "string" && assignedTo.length ? assignedTo : null,
      requiredSkill:
        typeof requiredSkill === "string" && requiredSkill.length ? requiredSkill : null,
      minReputation:
        typeof minReputation === "number" && !Number.isNaN(minReputation) ? minReputation : null,
      visibility: vis,
    },
  });

  await logActivity("task", `New task posted: "${String(description).slice(0, 50)}..." — ${bounty} USDC bounty`);

  return Response.json(serializeTask(task, { viewerAddress: poster }));
}
