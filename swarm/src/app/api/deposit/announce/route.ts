import type { NextRequest } from "next/server";
import { runDepositScan } from "@/lib/depositPoller";

// Fired by the DepositFlow UI right after the user's USDC.transfer receipt
// lands. Non-authoritative — it just kicks the scanner immediately instead
// of waiting for the next /api/balance poll. Authoritative crediting
// happens inside runDepositScan when the confirmation window passes.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const address =
    typeof body.address === "string" ? body.address.toLowerCase() : null;
  const txHash = typeof body.txHash === "string" ? body.txHash : null;
  if (!address || !txHash) {
    return Response.json({ error: "Missing address or txHash" }, { status: 400 });
  }
  try {
    const result = await runDepositScan();
    const match = result.newDeposits.find((d) => d.txHash === txHash);
    return Response.json({
      status: match ? "credited" : "pending",
      scanned: { fromBlock: result.fromBlock, toBlock: result.toBlock },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "scan_failed", message }, { status: 502 });
  }
}
