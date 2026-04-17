import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { readAllowance, verifyPairSignature } from "@/lib/session";
import { logActivity } from "@/lib/activity";

export const maxDuration = 60;

const CODE_PATTERN = /^pair_[A-Za-z0-9_-]{16,64}$/;
const SESSION_TOKEN_BYTES = 32;
const ALLOWANCE_POLL_INTERVAL_MS = 5_000;
const ALLOWANCE_POLL_ATTEMPTS = 6; // total ~30s

function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

function sanitizedSession(row: {
  address: string;
  budgetUsd: number;
  spentUsd: number;
  expiresAt: Date;
}) {
  return {
    address: row.address,
    budgetUsd: row.budgetUsd,
    spentUsd: row.spentUsd,
    expiresAt: row.expiresAt.toISOString(),
  };
}

// Browser-initiated: claim a pair code with an EIP-712 signature + on-chain
// USDC allowance. Creates the McpSession row the MCP will pick up on its
// next poll. Token leaves the server exactly once (on the GET that follows
// status=claimed → status=consumed transition).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code: string | undefined = typeof body.code === "string" ? body.code : undefined;
  const address: string | undefined = typeof body.address === "string" ? body.address.toLowerCase() : undefined;
  const budgetUsd: number | undefined = typeof body.budgetUsd === "number" ? body.budgetUsd : undefined;
  const expiresAt: number | undefined = typeof body.expiresAt === "number" ? body.expiresAt : undefined;
  const signature: string | undefined = typeof body.signature === "string" ? body.signature : undefined;

  if (!code || !address || budgetUsd === undefined || !expiresAt || !signature) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!CODE_PATTERN.test(code)) {
    return Response.json({ error: "Invalid pair code format" }, { status: 400 });
  }
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return Response.json({ error: "Invalid address" }, { status: 400 });
  }
  if (budgetUsd <= 0 || budgetUsd > 50) {
    return Response.json({ error: "Budget must be between $0 and $50" }, { status: 400 });
  }
  const expiresDate = new Date(expiresAt * 1000);
  const now = Date.now();
  if (expiresDate.getTime() <= now + 60_000) {
    return Response.json({ error: "expiresAt too soon" }, { status: 400 });
  }

  const budgetMicroUsd = BigInt(Math.round(budgetUsd * 1_000_000));

  // Verify the EIP-712 signature binds this code to this address + budget.
  // This alone doesn't stop a hostile signer — the on-chain allowance check
  // below is the security primitive that actually caps dollars.
  let sigOk = false;
  try {
    sigOk = verifyPairSignature({
      code,
      address,
      budgetMicroUsd,
      expiresAt,
      signature,
    });
  } catch {
    sigOk = false;
  }
  if (!sigOk) {
    return Response.json({ error: "Signature does not match address" }, { status: 401 });
  }

  // Poll the on-chain allowance — the approve tx may not have landed yet.
  let allowance: bigint = BigInt(0);
  for (let i = 0; i < ALLOWANCE_POLL_ATTEMPTS; i++) {
    try {
      allowance = await readAllowance(address);
    } catch {
      allowance = BigInt(0);
    }
    if (allowance >= budgetMicroUsd) break;
    if (i < ALLOWANCE_POLL_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, ALLOWANCE_POLL_INTERVAL_MS));
    }
  }
  if (allowance < budgetMicroUsd) {
    return Response.json(
      {
        error: "allowance_not_found",
        message:
          "USDC approval did not appear on-chain within 30s. Confirm the approve transaction landed and retry.",
      },
      { status: 409 },
    );
  }

  // Reject if this code was already claimed — codes are one-shot.
  const existing = await db.pairCode.findUnique({ where: { code } });
  if (existing && existing.status !== "pending") {
    return Response.json({ error: "Pair code already used" }, { status: 409 });
  }

  const token = generateSessionToken();
  const session = await db.mcpSession.create({
    data: {
      token,
      address,
      budgetUsd,
      spentUsd: 0,
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
    `MCP paired with ${address.slice(0, 8)}... — $${budgetUsd.toFixed(2)} budget`,
  );

  return Response.json({
    success: true,
    address,
    budgetUsd,
    expiresAt: expiresDate.toISOString(),
  });
}

// MCP-initiated long-poll. Returns the session token exactly once when a
// code transitions from claimed → consumed. Subsequent polls return 404 so
// replayed MCP processes can't silently pick up someone else's session.
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
  // status === "claimed" — deliver token exactly once then mark consumed.
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
