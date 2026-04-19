import { db } from "@/lib/db";
import { serializeTask } from "@/lib/serializeAgent";
import { TASK_LIST_SELECT } from "@/lib/taskSelect";
import { logActivity } from "@/lib/activity";
import { parsePrice } from "@/lib/geminiPricing";
import { requireX402Payment } from "@/lib/x402Middleware";
import { recordX402Settlement } from "@/lib/postSettleFanout";
import { resolveAgentAddress } from "@/lib/session";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const viewer =
    req.nextUrl.searchParams.get("viewer") ?? resolveAgentAddress(req) ?? undefined;
  const inbox = req.nextUrl.searchParams.get("inbox") === "1";
  // Task rows may carry a ~2 MB base64 attachment blob. Strip it from list
  // queries — the detail route refetches the full row when needed.
  const tasks = await db.task.findMany({
    orderBy: { createdAt: "desc" },
    select: TASK_LIST_SELECT,
  });

  if (inbox && viewer) {
    const vLower = viewer.toLowerCase();
    const myAgents = await db.agent.findMany({
      where: { creatorAddress: { equals: viewer, mode: "insensitive" } },
      select: { skill: true, reputation: true, type: true, roles: true },
    });
    const mySkills = new Set(myAgents.map((a) => a.skill.toLowerCase()));
    const bestRep = myAgents.reduce((m, a) => Math.max(m, a.reputation ?? 0), 0);
    // Treat legacy human_expert rows (roles[] empty) as holding "expert".
    const effectiveRoles = (a: { type: string; roles: string[] }) =>
      a.roles.length > 0 ? a.roles : a.type === "human_expert" ? ["expert"] : [];
    const isExpert = myAgents.some((a) => effectiveRoles(a).includes("expert"));
    const matching = tasks.filter((t) => {
      if (t.status !== "open") return false;
      if (t.assignedTo && t.assignedTo.toLowerCase() === vLower) return true;
      if (t.expertOnly && !isExpert) return false;
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
  const body = await req.json().catch(() => ({}));
  const {
    description,
    bounty,
    skill,
    payload,
    assignedTo,
    requiredSkill,
    minReputation,
    expertOnly,
    visibility,
  } = body;
  if (!description || !bounty || !skill) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const bountyUsd = parsePrice(String(bounty));
  if (!(bountyUsd > 0)) {
    return Response.json({ error: "invalid_bounty" }, { status: 400 });
  }
  const bountyMicroUsd = BigInt(Math.round(bountyUsd * 1_000_000));

  // x402 escrow: the poster's wallet signs EIP-3009 to move the bounty into
  // platform custody. Released to the claimer on submit via treasuryTransfer
  // (platform → user is outbound, x402 is inbound-only).
  const gate = await requireX402Payment(req, {
    priceResolver: () => bountyMicroUsd,
    description: `task escrow · ${String(description).slice(0, 40)}`,
    resource: "/api/tasks",
  });
  if (gate.kind === "challenge") return gate.response;

  const poster = gate.payer;

  let settled;
  try {
    settled = await gate.settle();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: "x402_settle_failed", message },
      { status: 502 },
    );
  }
  const settleTxHash = settled.response.transaction ?? "";

  const id = `task_${Date.now()}`;
  const { transactionId } = await recordX402Settlement({
    payer: poster,
    totalMicroUsd: bountyMicroUsd,
    settlementTxHash: settleTxHash,
    refType: "task",
    refId: id,
    description: `task escrow · ${String(description).slice(0, 40)}`,
  });

  const vis = visibility === "public" ? "public" : "private";
  // Auto-expiry window: if nobody claims within 7 days, the expire-tasks
  // cron refunds the bounty and closes the task. Lets posters walk away
  // without the bounty stranded in treasury forever.
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const task = await db.task.create({
    data: {
      id,
      description,
      bounty,
      bountyMicroUsd,
      escrowTransactionId: transactionId,
      skill,
      payload: typeof payload === "string" && payload.length ? payload : null,
      status: "open",
      postedBy: poster,
      assignedTo: typeof assignedTo === "string" && assignedTo.length ? assignedTo : null,
      requiredSkill:
        typeof requiredSkill === "string" && requiredSkill.length ? requiredSkill : null,
      minReputation:
        typeof minReputation === "number" && !Number.isNaN(minReputation) ? minReputation : null,
      expertOnly: expertOnly === true,
      visibility: vis,
      expiresAt,
    },
  });

  await logActivity(
    "task",
    `New task posted: "${String(description).slice(0, 50)}..." — ${bounty} USDC bounty · x402 ${settleTxHash.slice(0, 10)}…`,
  );

  return NextResponse.json(serializeTask(task, { viewerAddress: poster }), {
    headers: { "X-PAYMENT-RESPONSE": settled.paymentResponseHeader },
  });
}
