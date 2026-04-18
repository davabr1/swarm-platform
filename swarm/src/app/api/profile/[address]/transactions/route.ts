import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

const VALID_KINDS = new Set([
  "autonomous_spend",
  "manual_spend",
  "earning",
  "deposit",
  "refund",
]);

// Unified ledger reader powering the Transactions panel. Single source of
// truth: the Transaction table. Earnings, spends, deposits, and refunds
// all live here with a `kind` discriminator — no cross-table joins.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return Response.json({ error: "Invalid address" }, { status: 400 });
  }
  const wallet = address.toLowerCase();

  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");
  const limitRaw = Number(url.searchParams.get("limit") || 50);
  const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? limitRaw : 50));
  const cursor = url.searchParams.get("cursor");

  const where: Record<string, unknown> = { walletAddress: wallet };
  if (kindParam && VALID_KINDS.has(kindParam)) {
    where.kind = kindParam;
  }

  const rows = await db.transaction.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? trimmed[trimmed.length - 1].id : null;

  // Agents are referenced by id in guidance/image rows. Cheapest path:
  // fetch all referenced ids in one query and attach names server-side.
  const refIds = Array.from(
    new Set(trimmed.filter((r) => r.refId && r.refType).map((r) => r.refId!)),
  );
  const agentNameByRefId = new Map<string, string>();
  if (refIds.length > 0) {
    const [guidance, images] = await Promise.all([
      db.guidanceRequest.findMany({
        where: { id: { in: refIds } },
        select: { id: true, agentId: true },
      }),
      db.imageGeneration.findMany({
        where: { id: { in: refIds } },
        select: { id: true, agentId: true },
      }),
    ]);
    const agentIds = Array.from(
      new Set([...guidance.map((g) => g.agentId), ...images.map((i) => i.agentId)]),
    );
    if (agentIds.length > 0) {
      const agents = await db.agent.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true },
      });
      const nameByAgentId = new Map(agents.map((a) => [a.id, a.name]));
      for (const g of guidance) {
        agentNameByRefId.set(g.id, nameByAgentId.get(g.agentId) ?? g.agentId);
      }
      for (const i of images) {
        agentNameByRefId.set(i.id, nameByAgentId.get(i.agentId) ?? i.agentId);
      }
    }
  }

  return Response.json({
    entries: trimmed.map((r) => ({
      id: r.id,
      kind: r.kind,
      deltaMicroUsd: r.deltaMicroUsd.toString(),
      grossMicroUsd: r.grossMicroUsd.toString(),
      usd: (Number(r.deltaMicroUsd) / 1_000_000).toFixed(6),
      description: r.description,
      refType: r.refType,
      refId: r.refId,
      agentName: r.refId ? agentNameByRefId.get(r.refId) ?? null : null,
      txHash: r.txHash,
      blockNumber: r.blockNumber,
      status: r.status,
      createdAt: r.createdAt.getTime(),
    })),
    nextCursor,
    hasMore,
  });
}
