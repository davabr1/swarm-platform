import { db } from "@/lib/db";
import { resolveAgentAddress } from "@/lib/session";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Hide / unhide an image from the caller's profile gallery. Caller identified
// via the `X-Asker-Address` header — same non-authenticated attribution pattern
// used elsewhere for non-money-moving mutations. The hide is per-wallet and
// does not delete the underlying ImageGeneration row (which is shared/public).

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
  ctx: RouteContext<"/api/image/[id]/hide">,
) {
  const caller = await parseCaller(req);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;

  const image = await db.imageGeneration.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!image) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await db.hiddenImage.upsert({
    where: { walletAddress_imageId: { walletAddress: caller, imageId: id } },
    update: {},
    create: { walletAddress: caller, imageId: id },
  });

  return NextResponse.json({ hidden: true });
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/image/[id]/hide">,
) {
  const caller = await parseCaller(req);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;

  await db.hiddenImage
    .delete({
      where: { walletAddress_imageId: { walletAddress: caller, imageId: id } },
    })
    .catch(() => {
      // Deleting a row that doesn't exist is a no-op — caller wanted it gone.
    });

  return NextResponse.json({ hidden: false });
}
