import { db } from "@/lib/db";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/image/[id]
 *
 * Streams the PNG/JPEG bytes of a generated image out of Postgres.
 *
 * We used to persist generated images to `public/generated/<id>.png` and
 * let Next serve them as static files, but Vercel's filesystem is
 * read-only at runtime (only /tmp is writable, and /tmp is per-invocation
 * ephemeral). So the bytes live in `ImageGeneration.imageBase64` and this
 * route decodes + serves them with a long cache.
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/image/[id]">,
) {
  const { id } = await ctx.params;
  const row = await db.imageGeneration.findUnique({ where: { id } });
  if (!row) {
    return new Response("Not found", { status: 404 });
  }
  if (row.status !== "ready" || !row.imageBase64) {
    return new Response(
      JSON.stringify({
        status: row.status,
        error: row.errorMessage ?? "image not ready",
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const buffer = Buffer.from(row.imageBase64, "base64");
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": row.mimeType ?? "image/png",
      "Content-Length": String(buffer.length),
      // Generated images are immutable — safe to cache hard. Clients
      // addressing by id will never see a different image under the same id.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
