import { db } from "@/lib/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Public list of images saved to a profile. Returns light metadata only —
// prompt, creation time, agent name — no image bytes. Thumbnails are served
// lazily by the usual GET /api/image/[id] route.
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/profile/[address]/images">,
) {
  const { address } = await ctx.params;
  const wallet = address.toLowerCase();

  const saved = await db.savedImage.findMany({
    where: { walletAddress: wallet },
    orderBy: { savedAt: "desc" },
    take: 60,
  });
  if (saved.length === 0) return NextResponse.json({ entries: [] });

  const images = await db.imageGeneration.findMany({
    where: { id: { in: saved.map((s) => s.imageId) } },
    select: {
      id: true,
      prompt: true,
      status: true,
      agentId: true,
      createdAt: true,
      readyAt: true,
      mimeType: true,
    },
  });
  const agents = await db.agent.findMany({
    where: { id: { in: Array.from(new Set(images.map((i) => i.agentId))) } },
    select: { id: true, name: true },
  });
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const imgById = new Map(images.map((i) => [i.id, i]));

  const entries = saved
    .map((s) => {
      const img = imgById.get(s.imageId);
      if (!img || img.status !== "ready") return null;
      const agent = agentById.get(img.agentId);
      return {
        id: img.id,
        prompt: img.prompt,
        mimeType: img.mimeType,
        createdAt: img.createdAt,
        readyAt: img.readyAt,
        savedAt: s.savedAt,
        agent: agent ? { id: agent.id, name: agent.name } : null,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return NextResponse.json({ entries });
}
