import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { ethers } from "ethers";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";

export const maxDuration = 60;

const CODE_PATTERN = /^pair_[A-Za-z0-9_-]{16,64}$/;
const SESSION_TOKEN_BYTES = 32;
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;
const DEFAULT_EXPIRY_DAYS = 30;

function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

function sanitizedSession(row: {
  id: string;
  address: string;
  label: string | null;
  expiresAt: Date;
}) {
  return {
    id: row.id,
    address: row.address,
    label: row.label,
    expiresAt: row.expiresAt.toISOString(),
  };
}

// Browser-initiated: claim a pair code with a single EIP-191 signature
// binding the code to the wallet. Mints an McpSession the MCP long-poll
// will pick up. No on-chain step — spending draws from the wallet's
// deposited balance and is capped globally by UserProfile.autonomousCapUsd.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code: string | undefined = typeof body.code === "string" ? body.code : undefined;
  const address: string | undefined =
    typeof body.address === "string" ? body.address.toLowerCase() : undefined;
  const issuedAt: number | undefined =
    typeof body.issuedAt === "number" ? body.issuedAt : undefined;
  const signature: string | undefined =
    typeof body.signature === "string" ? body.signature : undefined;
  const label: string | null =
    typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 64) : null;
  const expiryDaysRaw =
    typeof body.expiryDays === "number" && Number.isFinite(body.expiryDays)
      ? body.expiryDays
      : DEFAULT_EXPIRY_DAYS;
  const expiryDays = Math.max(1, Math.min(365, Math.floor(expiryDaysRaw)));

  if (!code || !address || !issuedAt || !signature) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!CODE_PATTERN.test(code)) {
    return Response.json({ error: "Invalid pair code format" }, { status: 400 });
  }
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return Response.json({ error: "Invalid address" }, { status: 400 });
  }
  if (Math.abs(Date.now() - issuedAt) > MAX_SIGNATURE_AGE_MS) {
    return Response.json({ error: "Signature too old" }, { status: 400 });
  }

  const message = `Swarm MCP pair: ${code}@${address}@${issuedAt}`;
  let recovered = "";
  try {
    recovered = ethers.verifyMessage(message, signature).toLowerCase();
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  if (recovered !== address) {
    return Response.json({ error: "Signature does not match address" }, { status: 401 });
  }

  // Codes are one-shot.
  const existing = await db.pairCode.findUnique({ where: { code } });
  if (existing && existing.status !== "pending") {
    return Response.json({ error: "Pair code already used" }, { status: 409 });
  }

  const expiresDate = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
  const token = generateSessionToken();
  const session = await db.mcpSession.create({
    data: {
      token,
      address,
      label,
      expiresAt: expiresDate,
    },
  });
  await db.pairCode.upsert({
    where: { code },
    update: { status: "claimed", sessionId: session.id },
    create: { code, status: "claimed", sessionId: session.id },
  });

  await logActivity(
    "registration",
    `MCP paired with ${address.slice(0, 8)}...${label ? ` (${label})` : ""}`,
  );

  return Response.json({
    success: true,
    address,
    label,
    expiresAt: expiresDate.toISOString(),
    // Browser pairing reads the token directly from this POST response.
    // MCP pairing ignores this and picks up via GET (below).
    sessionToken: token,
  });
}

// MCP-initiated long-poll. Returns the session token exactly once when a
// code transitions from claimed → consumed.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code || !CODE_PATTERN.test(code)) {
    return Response.json({ error: "Invalid or missing code" }, { status: 400 });
  }
  const pair = await db.pairCode.findUnique({ where: { code } });
  if (!pair) return Response.json({ claimed: false });
  if (pair.status === "pending") return Response.json({ claimed: false });
  if (pair.status === "expired") return Response.json({ error: "Pair code expired" }, { status: 410 });
  if (pair.status === "consumed") {
    return Response.json({ error: "Pair code already consumed" }, { status: 410 });
  }
  if (!pair.sessionId) {
    return Response.json({ error: "Pair record missing session" }, { status: 500 });
  }
  const session = await db.mcpSession.findUnique({ where: { id: pair.sessionId } });
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 500 });
  }
  await db.pairCode.update({
    where: { code },
    data: { status: "consumed" },
  });
  return Response.json({
    claimed: true,
    sessionToken: session.token,
    ...sanitizedSession(session),
  });
}
