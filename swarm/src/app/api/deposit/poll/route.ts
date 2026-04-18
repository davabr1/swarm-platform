import type { NextRequest } from "next/server";
import { runDepositScan } from "@/lib/depositPoller";

// On-demand scanner trigger. The DepositFlow UI calls this after its own
// on-chain transfer receipt, so the user sees their balance update without
// waiting for the next background-poll tick.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const addressRaw =
    typeof body.address === "string" ? body.address.toLowerCase() : null;
  try {
    const result = await runDepositScan();
    const forAddress = addressRaw
      ? result.newDeposits.filter((d) => d.fromAddress === addressRaw)
      : result.newDeposits;
    return Response.json({
      scanned: { fromBlock: result.fromBlock, toBlock: result.toBlock },
      creditedMicroUsd: forAddress
        .reduce((acc, d) => acc + d.microUsd, BigInt(0))
        .toString(),
      newTxHashes: forAddress.map((d) => d.txHash),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "scan_failed", message }, { status: 502 });
  }
}
