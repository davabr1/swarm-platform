import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

// List active MCP sessions for a wallet. Tokens are never surfaced — only
// id, budget, spent, and expiry so the /profile UI can render a revoke
// button. The revoke flow re-authenticates with a fresh signature so this
// endpoint being world-readable doesn't grant control.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return Response.json({ error: "Invalid address" }, { status: 400 });
  }
  const rows = await db.mcpSession.findMany({
    where: {
      address: address.toLowerCase(),
      revokedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
  const now = Date.now();
  const sessions = rows
    .filter((s) => s.expiresAt.getTime() > now)
    .map((s) => ({
      id: s.id,
      budgetUsd: s.budgetUsd,
      spentUsd: s.spentUsd,
      expiresAt: s.expiresAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
    }));
  return Response.json({ sessions });
}
