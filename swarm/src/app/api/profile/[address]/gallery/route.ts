import { db } from "@/lib/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Unified image gallery: every ready image where the wallet (or one of its
// MCPs) paid to mint, minus any the owner explicitly hid. The old explicit
// "save" flow is gone — images auto-pin to the payer's profile, and the
// pencil/edit UI writes to HiddenImage to remove things from the grid.
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/profile/[address]/gallery">,
) {
  const { address } = await ctx.params;
  const wallet = address.toLowerCase();

  const [requested, hidden] = await Promise.all([
    db.imageGeneration.findMany({
      where: {
        askerAddress: { equals: wallet, mode: "insensitive" },
        status: "ready",
      },
      orderBy: { readyAt: "desc" },
      take: 120,
      select: {
        id: true,
        prompt: true,
        mimeType: true,
        createdAt: true,
        readyAt: true,
        agentId: true,
      },
    }),
    db.hiddenImage.findMany({
      where: { walletAddress: wallet },
      select: { imageId: true },
    }),
  ]);

  const hiddenIds = new Set(hidden.map((h) => h.imageId));
  const visible = requested.filter((r) => !hiddenIds.has(r.id));

  const agentIds = Array.from(new Set(visible.map((r) => r.agentId)));
  const agents = agentIds.length
    ? await db.agent.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true },
      })
    : [];
  const agentById = new Map(agents.map((a) => [a.id, a]));

  const entries = visible.map((img) => {
    const a = agentById.get(img.agentId);
    return {
      id: img.id,
      prompt: img.prompt,
      mimeType: img.mimeType,
      createdAt: img.createdAt,
      readyAt: img.readyAt,
      agent: a ? { id: a.id, name: a.name } : null,
    };
  });

  return NextResponse.json({ entries });
}
