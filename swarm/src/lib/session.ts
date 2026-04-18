import "server-only";
import { ethers } from "ethers";
import type { McpSession } from "@prisma/client";
import { db } from "./db";

// NOTE: session tokens are stored raw for hackathon simplicity. Production
// systems should store a sha256 of the token and compare hashes so a DB leak
// doesn't yield live bearer credentials.

export type SessionResolution =
  | { kind: "session"; session: McpSession }
  | { kind: "anonymous" }
  | { kind: "invalid_token"; reason: "unknown" | "revoked" | "expired" };

// Distinguishes "no bearer" (browser callers hit the manual-session cookie
// path) from "bearer but bad" (MCP tokens that have been revoked / expired —
// MUST 401 so the MCP drops the local session and re-pairs).
export async function resolveSession(req: Request): Promise<SessionResolution> {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) return { kind: "anonymous" };
  const token = header.slice(7).trim();
  if (!token) return { kind: "invalid_token", reason: "unknown" };
  const session = await db.mcpSession.findUnique({ where: { token } });
  if (!session) return { kind: "invalid_token", reason: "unknown" };
  if (session.revokedAt) return { kind: "invalid_token", reason: "revoked" };
  if (session.expiresAt.getTime() <= Date.now()) return { kind: "invalid_token", reason: "expired" };
  return { kind: "session", session };
}

export async function getSessionFromRequest(req: Request): Promise<McpSession | null> {
  const r = await resolveSession(req);
  return r.kind === "session" ? r.session : null;
}

export function verifyRevokeSignature(params: {
  sessionId: string;
  issuedAt: number;
  address: string;
  signature: string;
}): boolean {
  const message = `Swarm session revoke: ${params.sessionId}@${params.issuedAt}`;
  const recovered = ethers.verifyMessage(message, params.signature);
  return recovered.toLowerCase() === params.address.toLowerCase();
}
