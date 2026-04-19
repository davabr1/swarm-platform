import { db } from "@/lib/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Public list of images this wallet (or its paired MCPs) paid to generate.
// Keyed on `askerAddress` — set at mint time from the x402 payer. No save
// step required: anything Claude/Cursor/Codex called through this wallet's
// MCP ends up here automatically.
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/profile/[address]/requested-images">,
) {
  const { address } = await ctx.params;
  const wallet = address.toLowerCase();

  const images = await db.imageGeneration.findMany({
    where: {
      askerAddress: { equals: wallet, mode: "insensitive" },
      status: "ready",
    },
    orderBy: { readyAt: "desc" },
    take: 60,
    select: {
      id: true,
      prompt: true,
      mimeType: true,
      createdAt: true,
      readyAt: true,
      agentId: true,
    },
  });
  if (images.length === 0) return NextResponse.json({ entries: [] });

  const agents = await db.agent.findMany({
    where: { id: { in: Array.from(new Set(images.map((i) => i.agentId))) } },
    select: { id: true, name: true },
  });
  const agentById = new Map(agents.map((a) => [a.id, a]));

  const entries = images.map((img) => {
    const agent = agentById.get(img.agentId);
    return {
      id: img.id,
      prompt: img.prompt,
      mimeType: img.mimeType,
      createdAt: img.createdAt,
      readyAt: img.readyAt,
      agent: agent ? { id: agent.id, name: agent.name } : null,
    };
  });

  return NextResponse.json({ entries });
}
