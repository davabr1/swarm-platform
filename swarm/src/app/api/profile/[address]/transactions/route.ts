import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { listMcps } from "@/lib/mcpRegistry";

const VALID_KINDS = new Set([
  "x402_settle",
  "earning",
  "refund",
  // Legacy — still readable for historical rows.
  "autonomous_spend",
  "manual_spend",
  "deposit",
]);

// Unified ledger reader powering the Transactions panel. Single source of
// truth: the Transaction table — unions the profile's main wallet with any
// MCP addresses registered to it under MCPRegistry.sol so spend initiated by
// a paired MCP shows up on the owner's profile.
//
// Refund rows are always nested under their parent x402_settle row (matched
// by walletAddress + refType + refId) — never rendered standalone — so the
// user sees "charged X, refunded Y, net Z" on a single line. The `?kind=refund`
// filter is reinterpreted as "x402_settle rows that have a refund attached".
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

  const pairedMcps = await listMcps(wallet);
  const mcpAddresses = pairedMcps.map((m) => m.address.toLowerCase());
  const mcpSet = new Set(mcpAddresses);
  const allWallets = Array.from(new Set([wallet, ...mcpAddresses]));

  // `scope=autonomous` = only paired-MCP rows. `scope=user` = only the main
  // wallet. Default = both. Lets the panel split autonomous agent spend into
  // its own section.
  const scope = url.searchParams.get("scope");
  const scopedWallets =
    scope === "autonomous"
      ? mcpAddresses
      : scope === "user"
        ? [wallet]
        : allWallets;

  // Early-out for a profile with no paired MCPs asking for the autonomous
  // slice — no rows can possibly match.
  if (scopedWallets.length === 0) {
    return Response.json({ entries: [], nextCursor: null, hasMore: false });
  }

  const walletFilter =
    scopedWallets.length === 1
      ? { walletAddress: scopedWallets[0] }
      : { walletAddress: { in: scopedWallets } };

  const where: Record<string, unknown> = {};

  if (kindParam === "refund") {
    // Reinterpret: show x402_settle rows that have a matching refund. Lets
    // users see the original charge and the refund on a single merged line.
    const refundKeys = await db.transaction.findMany({
      where: { ...walletFilter, kind: "refund" },
      select: { walletAddress: true, refType: true, refId: true },
    });
    const uniqKeys = Array.from(
      new Set(
        refundKeys
          .filter((r) => r.refType && r.refId)
          .map((r) => `${r.walletAddress}::${r.refType}::${r.refId}`),
      ),
    );
    if (uniqKeys.length === 0) {
      return Response.json({ entries: [], nextCursor: null, hasMore: false });
    }
    where.kind = "x402_settle";
    where.OR = uniqKeys.map((k) => {
      const [w, rt, ri] = k.split("::");
      return { walletAddress: w, refType: rt, refId: ri };
    });
  } else {
    Object.assign(where, walletFilter);
    if (kindParam && VALID_KINDS.has(kindParam)) {
      where.kind = kindParam;
    } else {
      // Default ("all") hides refund rows — they appear nested on their
      // parent x402_settle row.
      where.kind = { not: "refund" };
    }
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

  // Fetch refund rows that match any x402_settle on this page so we can nest
  // them — "charged X, refunded Y, net Z" renders on one line.
  const settleKeys = trimmed
    .filter((r) => r.kind === "x402_settle" && r.refType && r.refId)
    .map((r) => ({
      walletAddress: r.walletAddress,
      refType: r.refType as string,
      refId: r.refId as string,
    }));
  const refundByKey = new Map<
    string,
    { grossMicroUsd: bigint; txHash: string | null; status: string; createdAt: Date }
  >();
  if (settleKeys.length > 0) {
    const refunds = await db.transaction.findMany({
      where: {
        kind: "refund",
        OR: settleKeys.map((k) => ({
          walletAddress: k.walletAddress,
          refType: k.refType,
          refId: k.refId,
        })),
      },
      select: {
        walletAddress: true,
        refType: true,
        refId: true,
        grossMicroUsd: true,
        txHash: true,
        status: true,
        createdAt: true,
      },
    });
    for (const r of refunds) {
      refundByKey.set(`${r.walletAddress}::${r.refType}::${r.refId}`, r);
    }
  }

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
    entries: trimmed.map((r) => {
      const refund =
        r.kind === "x402_settle" && r.refType && r.refId
          ? refundByKey.get(`${r.walletAddress}::${r.refType}::${r.refId}`)
          : undefined;
      return {
        id: r.id,
        kind: r.kind,
        walletAddress: r.walletAddress,
        isAutonomous: mcpSet.has(r.walletAddress.toLowerCase()),
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
        refund: refund
          ? {
              amountMicroUsd: refund.grossMicroUsd.toString(),
              txHash: refund.txHash,
              status: refund.status,
              createdAt: refund.createdAt.getTime(),
            }
          : null,
      };
    }),
    nextCursor,
    hasMore,
  });
}
