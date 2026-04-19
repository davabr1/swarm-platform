import { db } from "@/lib/db";
import { serializeAgent } from "@/lib/serializeAgent";
import { logActivity } from "@/lib/activity";
import type { NextRequest } from "next/server";

const VALID_ROLES = new Set(["expert", "completer"]);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, skill, description, rate, walletAddress, roles } = body;
  if (!name || !skill || !description || !rate || !walletAddress) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const roleList: string[] = Array.isArray(roles)
    ? Array.from(new Set(roles.filter((r): r is string => typeof r === "string" && VALID_ROLES.has(r))))
    : [];
  if (roleList.length === 0) {
    return Response.json(
      { error: "Pick at least one role — expert or task completer." },
      { status: 400 },
    );
  }

  const existingHumans = await db.agent.findMany({ where: { type: "human_expert" } });
  const normalized = String(walletAddress).toLowerCase();
  const existing = existingHumans.find((a) => a.walletAddress.toLowerCase() === normalized);
  if (existing) {
    return Response.json(
      { error: "A human profile already exists for this wallet address", agent: serializeAgent(existing) },
      { status: 409 }
    );
  }

  const id = `human_${Date.now()}`;
  const human = await db.agent.create({
    data: {
      id,
      name,
      skill,
      description,
      price: `$${rate}/task`,
      walletAddress,
      creatorAddress: walletAddress,
      systemPrompt: "",
      type: "human_expert",
      roles: roleList,
      userCreated: true,
    },
  });

  const rolesLabel = roleList.join(" + ");
  await logActivity(
    "registration",
    `New human (${rolesLabel}) "${name}" joined with wallet ${String(walletAddress).slice(0, 8)}...`,
  );
  return new Response(JSON.stringify(serializeAgent(human)), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
