import { db } from "@/lib/db";

// Homepage stats. `usdcFlowedMicroUsd` is the ground-truth sum of gross
// micro-USDC moved on-chain through x402 — computed from the spend side of
// the ledger so each on-chain transfer is counted exactly once (every spend
// has a matching earning row; summing both would double-count).
export async function GET() {
  const [spendAgg, services, humans] = await Promise.all([
    db.transaction.aggregate({
      _sum: { grossMicroUsd: true },
      where: {
        kind: { in: ["x402_settle", "autonomous_spend", "manual_spend"] },
        status: "confirmed",
      },
    }),
    db.agent.count({ where: { type: { in: ["ai", "custom_skill"] } } }),
    db.agent.count({ where: { type: "human_expert" } }),
  ]);

  const micro = spendAgg._sum.grossMicroUsd ?? BigInt(0);
  return Response.json({
    usdcFlowedMicroUsd: micro.toString(),
    services,
    humans,
  });
}
