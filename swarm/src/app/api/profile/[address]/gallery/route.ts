import { db } from "@/lib/db";
import { listMcps } from "@/lib/mcpRegistry";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Unified image gallery: every ready image keyed under the wallet OR one of
// its paired MCPs, minus anything the owner explicitly hid. We split the
// feed into two sources so the UI can dot-tag origin:
//   - "user"  = askerAddress === the profile's wallet (browser marketplace chat)
//   - "agent" = askerAddress === one of the wallet's on-chain paired MCPs
//                (autonomous calls from Claude/Cursor/Codex)
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/profile/[address]/gallery">,
) {
  const { address } = await ctx.params;
  const wallet = address.toLowerCase();

  const paired = await listMcps(wallet);
  const mcpAddresses = paired.map((p) => p.address.toLowerCase());
  const mcpSet = new Set(mcpAddresses);
  const allAddresses = Array.from(new Set([wallet, ...mcpAddresses]));

  const [requested, hidden] = await Promise.all([
    db.imageGeneration.findMany({
      where: {
        askerAddress: { in: allAddresses, mode: "insensitive" },
        status: "ready",
      },
      orderBy: { readyAt: "desc" },
      take: 160,
      select: {
        id: true,
        prompt: true,
        mimeType: true,
        createdAt: true,
        readyAt: true,
        agentId: true,
        askerAddress: true,
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
    const asker = img.askerAddress.toLowerCase();
    const source: "user" | "agent" = mcpSet.has(asker) ? "agent" : "user";
    return {
      id: img.id,
      prompt: img.prompt,
      mimeType: img.mimeType,
      createdAt: img.createdAt,
      readyAt: img.readyAt,
      source,
      agent: a ? { id: a.id, name: a.name } : null,
    };
  });

  return NextResponse.json({ entries });
}
