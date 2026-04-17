import type { NextRequest } from "next/server";
import { ethers } from "ethers";
import { db } from "@/lib/db";
import { readAllowance } from "@/lib/session";
import { logActivity } from "@/lib/activity";

const MAX_SIG_AGE_MS = 5 * 60 * 1000;
const MAX_BUDGET_USD = 200; // ceiling across all topup paths
const ALLOWANCE_POLL_INTERVAL_MS = 5_000;
const ALLOWANCE_POLL_ATTEMPTS = 6;

// Extend (or replace) an existing McpSession's budget. The user has
// already signed a fresh USDC.approve(orchestrator, newBudget * 10^6) in
// their wallet. We verify:
//   1) they signed a message authorizing this topup (prevents anyone from
//      bumping anyone else's session just because they know the id),
//   2) the on-chain allowance reflects the new budget,
// then reset the DB counter so the session tracks the fresh allowance
// one-to-one. Historical spend lives on GuidanceRequest / ImageGeneration
// rows and is untouched — the audit trail stays intact.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sessionId: string | undefined = typeof body.sessionId === "string" ? body.sessionId : undefined;
  const newBudgetUsd: number | undefined =
    typeof body.newBudgetUsd === "number" ? body.newBudgetUsd : undefined;
  const issuedAt: number | undefined = typeof body.issuedAt === "number" ? body.issuedAt : undefined;
  const signature: string | undefined = typeof body.signature === "string" ? body.signature : undefined;

  if (!sessionId || newBudgetUsd === undefined || !issuedAt || !signature) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (newBudgetUsd <= 0 || newBudgetUsd > MAX_BUDGET_USD) {
    return Response.json(
      { error: `Budget must be between 0 and ${MAX_BUDGET_USD} USDC` },
      { status: 400 },
    );
  }
  const now = Date.now();
  if (Math.abs(now - issuedAt) > MAX_SIG_AGE_MS) {
    return Response.json({ error: "Signature too old or in the future" }, { status: 400 });
  }

  const session = await db.mcpSession.findUnique({ where: { id: sessionId } });
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
  if (session.revokedAt) return Response.json({ error: "Session revoked — pair again" }, { status: 410 });

  // Signature must come from the session's wallet — only the owner can
  // bump their own budget. Message binds to sessionId + new amount + nonce
  // so a captured signature can't be replayed on a different topup.
  const message = `Swarm session topup: ${sessionId}@${issuedAt}@${newBudgetUsd}`;
  let sigOk = false;
  try {
    const recovered = ethers.verifyMessage(message, signature);
    sigOk = recovered.toLowerCase() === session.address.toLowerCase();
  } catch {
    sigOk = false;
  }
  if (!sigOk) {
    return Response.json({ error: "Signature does not match session address" }, { status: 401 });
  }

  const newBudgetMicroUsd = BigInt(Math.round(newBudgetUsd * 1_000_000));

  // Poll the on-chain allowance — the approve tx may still be confirming.
  let allowance: bigint = BigInt(0);
  for (let i = 0; i < ALLOWANCE_POLL_ATTEMPTS; i++) {
    try {
      allowance = await readAllowance(session.address);
    } catch {
      allowance = BigInt(0);
    }
    if (allowance >= newBudgetMicroUsd) break;
    if (i < ALLOWANCE_POLL_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, ALLOWANCE_POLL_INTERVAL_MS));
    }
  }
  if (allowance < newBudgetMicroUsd) {
    return Response.json(
      {
        error: "allowance_not_found",
        message:
          "Your USDC approve transaction did not show up on-chain within 30s. Confirm the approve landed and retry.",
      },
      { status: 409 },
    );
  }

  // Reset spentUsd to 0 because USDC.approve() *replaces* allowance — the
  // on-chain remaining is now exactly newBudget, regardless of what was
  // spent before. Historical spend stays in GuidanceRequest rows.
  await db.mcpSession.update({
    where: { id: sessionId },
    data: {
      budgetUsd: newBudgetUsd,
      spentUsd: 0,
    },
  });

  await logActivity(
    "registration",
    `MCP session topped up: ${session.address.slice(0, 8)}... → ${newBudgetUsd.toFixed(2)} USDC budget`,
  );

  return Response.json({
    success: true,
    budgetUsd: newBudgetUsd,
    spentUsd: 0,
  });
}
