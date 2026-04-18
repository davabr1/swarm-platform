import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

// List active MCP sessions for a wallet. Tokens are never surfaced — only
// metadata for the /profile UI. Spending is enforced globally through
// UserProfile.autonomousCapUsd; no per-session budget anymore.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return Response.json({ error: "Invalid address" }, { status: 400 });
  }
  const wallet = address.toLowerCase();
  const rows = await db.mcpSession.findMany({
    where: { address: wallet, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const now = Date.now();
  const active = rows.filter((s) => s.expiresAt.getTime() > now);

  // Call counts by session id. `refType=guidance|image` + `refId` on the
  // Transaction ledger is the source of truth — but we'd need to reverse
  // through guidance/image rows to recover which session authored the call.
  // For now, just count autonomous spends per wallet (shared across sessions)
  // and surface it uniformly. Cheap, and enough for the UI's purpose.
  const autonomousCalls = await db.transaction.count({
    where: { walletAddress: wallet, kind: "autonomous_spend" },
  });

  const sessions = active.map((s) => ({
    id: s.id,
    label: s.label,
    expiresAt: s.expiresAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    // Aggregate autonomous-call count across all this wallet's sessions.
    // Duplicated per row is fine — the UI treats it as "activity", not a
    // per-session tally.
    callsCount: autonomousCalls,
  }));
  return Response.json({ sessions });
}
