import { db } from "@/lib/db";
import { serializeAgent, serializeTask } from "@/lib/serializeAgent";
import { config } from "@/lib/config";
import type { NextRequest } from "next/server";

function isAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

type ProfileRow = {
  walletAddress: string;
  displayName: string | null;
  bio: string | null;
  email: string | null;
  balanceMicroUsd: bigint;
  autonomousCapUsd: string | null;
  autonomousSpentMicroUsd: bigint;
  autoTopup: boolean;
  createdAt: Date;
  updatedAt: Date;
};

async function loadPortfolio(address: string, viewer?: string) {
  const addrLower = address.toLowerCase();
  const [profile, agents, tasks] = await Promise.all([
    db.userProfile.findUnique({ where: { walletAddress: addrLower } }),
    db.agent.findMany({
      where: {
        OR: [
          { creatorAddress: { equals: address, mode: "insensitive" } },
          { walletAddress: { equals: address, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
    }),
    db.task.findMany({
      where: {
        OR: [
          { postedBy: { equals: address, mode: "insensitive" } },
          { claimedBy: { equals: address, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const postedTasks = tasks.filter((t) => t.postedBy?.toLowerCase() === addrLower);
  const claimedTasks = tasks.filter((t) => t.claimedBy?.toLowerCase() === addrLower);

  let inbox: typeof tasks = [];
  const openTasks = await db.task.findMany({ where: { status: "open" } });
  const mySkills = new Set(agents.map((a) => a.skill.toLowerCase()));
  const bestRep = agents.reduce((m, a) => Math.max(m, a.reputation ?? 0), 0);
  inbox = openTasks.filter((t) => {
    if (t.postedBy?.toLowerCase() === addrLower) return false;
    if (t.assignedTo && t.assignedTo.toLowerCase() === addrLower) return true;
    if (
      t.requiredSkill &&
      mySkills.has(t.requiredSkill.toLowerCase()) &&
      (t.minReputation == null || bestRep >= t.minReputation)
    ) {
      return true;
    }
    return false;
  });

  const defaulted: ProfileRow = profile ?? {
    walletAddress: addrLower,
    displayName: null,
    bio: null,
    email: null,
    balanceMicroUsd: BigInt(0),
    autonomousCapUsd: null,
    autonomousSpentMicroUsd: BigInt(0),
    autoTopup: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    profile: defaulted,
    agents: agents.map((a) => serializeAgent(a)),
    postedTasks: postedTasks.map((t) => serializeTask(t, { viewerAddress: viewer })),
    claimedTasks: claimedTasks.map((t) => serializeTask(t, { viewerAddress: viewer })),
    inbox: inbox.map((t) => serializeTask(t, { viewerAddress: viewer })),
  };
}

function serializeProfile(p: ProfileRow) {
  const capMicro = p.autonomousCapUsd
    ? BigInt(Math.round(Number(p.autonomousCapUsd) * 1_000_000))
    : config.defaultAutonomousCapMicroUsd;
  return {
    walletAddress: p.walletAddress,
    displayName: p.displayName ?? undefined,
    bio: p.bio ?? undefined,
    email: p.email ?? undefined,
    balanceMicroUsd: p.balanceMicroUsd.toString(),
    autonomousCapUsd: p.autonomousCapUsd ?? undefined,
    autonomousCapMicroUsd: capMicro.toString(),
    autonomousSpentMicroUsd: p.autonomousSpentMicroUsd.toString(),
    autoTopup: p.autoTopup,
    createdAt: p.createdAt.getTime(),
    updatedAt: p.updatedAt.getTime(),
  };
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/profile/[address]">) {
  const { address } = await ctx.params;
  if (!isAddress(address)) {
    return Response.json({ error: "Invalid address" }, { status: 400 });
  }
  const viewer = req.nextUrl.searchParams.get("viewer") ?? undefined;
  const portfolio = await loadPortfolio(address, viewer);
  return Response.json({
    ...portfolio,
    profile: serializeProfile(portfolio.profile),
  });
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/profile/[address]">) {
  const { address } = await ctx.params;
  if (!isAddress(address)) {
    return Response.json({ error: "Invalid address" }, { status: 400 });
  }
  const viewer = req.nextUrl.searchParams.get("viewer");
  if (!viewer || viewer.toLowerCase() !== address.toLowerCase()) {
    return Response.json({ error: "Viewer must match profile address" }, { status: 403 });
  }

  // Profile metadata only. Autonomous cap mutation goes through the
  // signature-gated /api/balance/cap endpoint.
  const body = await req.json().catch(() => ({}));
  const data: Record<string, string | boolean | null> = {};
  if (typeof body.displayName === "string") data.displayName = body.displayName.slice(0, 80) || null;
  if (typeof body.bio === "string") data.bio = body.bio.slice(0, 500) || null;
  if (typeof body.email === "string") data.email = body.email.slice(0, 200) || null;
  if (typeof body.autoTopup === "boolean") data.autoTopup = body.autoTopup;

  const addrLower = address.toLowerCase();
  const profile = await db.userProfile.upsert({
    where: { walletAddress: addrLower },
    update: data,
    create: { walletAddress: addrLower, ...data },
  });

  return Response.json(serializeProfile(profile));
}
