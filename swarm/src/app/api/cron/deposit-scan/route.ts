import { NextRequest } from "next/server";
import { runDepositScan } from "@/lib/depositPoller";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return new Response("cron disabled", { status: 503 });

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await runDepositScan();
    return Response.json({
      ok: true,
      fromBlock: result.fromBlock,
      toBlock: result.toBlock,
      newDeposits: result.newDeposits.map((d) => ({
        txHash: d.txHash,
        fromAddress: d.fromAddress,
        microUsd: d.microUsd.toString(),
        blockNumber: d.blockNumber,
      })),
    });
  } catch (err) {
    console.error("cron deposit-scan failed:", err instanceof Error ? err.message : err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
