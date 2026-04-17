import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

// Unified spend history for a wallet — merges GuidanceRequest and
// ImageGeneration rows where askerAddress = the profile's wallet. Sorted
// newest first. Lets the user see what their MCP agents autonomously
// paid for, with a link to each settlement tx on the block explorer.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return Response.json({ error: "Invalid address" }, { status: 400 });
  }
  const addrLower = address.toLowerCase();

  // Query both tables in parallel. Cap each at 50 — the merged list is
  // then re-sorted and trimmed so the UI sees at most 50 total entries.
  const [guidance, images] = await Promise.all([
    db.guidanceRequest.findMany({
      where: {
        askerAddress: { equals: addrLower, mode: "insensitive" },
        status: { in: ["ready", "failed_settlement"] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        agentId: true,
        totalUsd: true,
        commissionUsd: true,
        settlementTxHash: true,
        settlementStatus: true,
        status: true,
        createdAt: true,
      },
    }),
    db.imageGeneration.findMany({
      where: {
        askerAddress: { equals: addrLower, mode: "insensitive" },
        status: { in: ["ready", "failed_settlement"] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        agentId: true,
        totalUsd: true,
        commissionUsd: true,
        settlementTxHash: true,
        settlementStatus: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  const agentIds = Array.from(
    new Set([...guidance.map((g) => g.agentId), ...images.map((i) => i.agentId)]),
  );
  const agents = await db.agent.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true },
  });
  const agentName = new Map(agents.map((a) => [a.id, a.name]));

  const entries = [
    ...guidance.map((g) => ({
      id: g.id,
      type: "guidance" as const,
      agentId: g.agentId,
      agentName: agentName.get(g.agentId) ?? g.agentId,
      totalUsd: g.totalUsd,
      commissionUsd: g.commissionUsd,
      settlementTxHash: g.settlementTxHash,
      settlementStatus: g.settlementStatus,
      status: g.status,
      createdAt: g.createdAt.getTime(),
    })),
    ...images.map((i) => ({
      id: i.id,
      type: "image" as const,
      agentId: i.agentId,
      agentName: agentName.get(i.agentId) ?? i.agentId,
      totalUsd: i.totalUsd,
      commissionUsd: i.commissionUsd,
      settlementTxHash: i.settlementTxHash,
      settlementStatus: i.settlementStatus,
      status: i.status,
      createdAt: i.createdAt.getTime(),
    })),
  ]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50);

  const totalSpentUsd = entries.reduce(
    (acc, e) => acc + (e.totalUsd ? parseFloat(e.totalUsd) : 0),
    0,
  );

  return Response.json({
    entries,
    totalSpentUsd,
    count: entries.length,
  });
}
