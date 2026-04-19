import { db } from "@/lib/db";
import { resolveAgentAddress } from "@/lib/session";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Save / unsave an image to the caller's profile. Caller identified via the
// `X-Asker-Address` header — same non-authenticated attribution pattern used
// elsewhere for non-money-moving mutations (task rate/cancel, profile edit).
// The only write is a join-table row, so worst-case griefing is a cosmetic
// pin on someone else's gallery; we accept that trade-off per session.ts.

async function parseCaller(req: NextRequest) {
  const caller = resolveAgentAddress(req);
  if (!caller) {
    return NextResponse.json(
      { error: "missing_x_asker_address" },
      { status: 401 },
    );
  }
  return caller;
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/image/[id]/save">,
) {
  const caller = await parseCaller(req);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;

  const image = await db.imageGeneration.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!image) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (image.status !== "ready") {
    return NextResponse.json(
      { error: "image_not_ready" },
      { status: 409 },
    );
  }

  await db.savedImage.upsert({
    where: { walletAddress_imageId: { walletAddress: caller, imageId: id } },
    update: {},
    create: { walletAddress: caller, imageId: id },
  });

  return NextResponse.json({ saved: true });
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/image/[id]/save">,
) {
  const caller = await parseCaller(req);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;

  await db.savedImage
    .delete({
      where: { walletAddress_imageId: { walletAddress: caller, imageId: id } },
    })
    .catch(() => {
      // Deleting a row that doesn't exist is a no-op from the caller's
      // perspective — they wanted it gone, it's gone.
    });

  return NextResponse.json({ saved: false });
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/image/[id]/save">,
) {
  const caller = resolveAgentAddress(req);
  const { id } = await ctx.params;
  if (!caller) return NextResponse.json({ saved: false });

  const row = await db.savedImage.findUnique({
    where: { walletAddress_imageId: { walletAddress: caller, imageId: id } },
  });
  return NextResponse.json({ saved: Boolean(row) });
}
