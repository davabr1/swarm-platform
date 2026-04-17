import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyRevokeSignature } from "@/lib/session";
import { logActivity } from "@/lib/activity";

const MAX_SIG_AGE_MS = 5 * 60 * 1000;

// Revoking a session requires a fresh signed message from the session's
// wallet. We don't call USDC.approve(orchestrator, 0) — yanking the
// allowance on-chain is a future enhancement; for now a soft revoke is
// enough since every tool call re-checks expiresAt + revokedAt server-side.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sessionId: string | undefined = typeof body.sessionId === "string" ? body.sessionId : undefined;
  const issuedAt: number | undefined = typeof body.issuedAt === "number" ? body.issuedAt : undefined;
  const signature: string | undefined = typeof body.signature === "string" ? body.signature : undefined;

  if (!sessionId || !issuedAt || !signature) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }
  const now = Date.now();
  if (Math.abs(now - issuedAt) > MAX_SIG_AGE_MS) {
    return Response.json({ error: "Signature too old or in the future" }, { status: 400 });
  }

  const session = await db.mcpSession.findUnique({ where: { id: sessionId } });
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
  if (session.revokedAt) return Response.json({ revoked: true, alreadyRevoked: true });

  let sigOk = false;
  try {
    sigOk = verifyRevokeSignature({
      sessionId,
      issuedAt,
      address: session.address,
      signature,
    });
  } catch {
    sigOk = false;
  }
  if (!sigOk) {
    return Response.json({ error: "Signature does not match session address" }, { status: 401 });
  }

  await db.mcpSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
  await logActivity(
    "registration",
    `MCP session revoked for ${session.address.slice(0, 8)}...`,
  );
  return Response.json({ revoked: true });
}
