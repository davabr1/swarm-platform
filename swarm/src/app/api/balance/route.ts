import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { runDepositScan } from "@/lib/depositPoller";

// Merged view of the profile's deposited balance and autonomous-cap state.
// Runs a best-effort deposit scan first so a user who just transferred USDC
// sees their balance update when they land on the profile page.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const addressRaw = url.searchParams.get("address");
  const address = addressRaw?.toLowerCase();
  if (!address || !/^0x[a-f0-9]{40}$/.test(address)) {
    return Response.json({ error: "Missing or invalid address" }, { status: 400 });
  }

  // Fire-and-forget-ish scan. If the RPC is down we still return a balance
  // from the DB; the caller can retry.
  try {
    await runDepositScan();
  } catch {
    // Swallow — stale data is better than a 502 for the balance readout.
  }

  const profile = await db.userProfile.findUnique({
    where: { walletAddress: address },
  });

  const cap = profile?.autonomousCapUsd
    ? Number(profile.autonomousCapUsd)
    : Number(config.defaultAutonomousCapMicroUsd) / 1_000_000;
  const capMicroUsd = BigInt(Math.round(cap * 1_000_000));
  const balanceMicroUsd = profile?.balanceMicroUsd ?? BigInt(0);
  const spentMicroUsd = profile?.autonomousSpentMicroUsd ?? BigInt(0);

  return Response.json({
    address,
    balanceMicroUsd: balanceMicroUsd.toString(),
    balanceUsd: (Number(balanceMicroUsd) / 1_000_000).toFixed(6),
    autonomousCapMicroUsd: capMicroUsd.toString(),
    autonomousCapUsd: cap.toFixed(6),
    autonomousSpentMicroUsd: spentMicroUsd.toString(),
    autonomousSpentUsd: (Number(spentMicroUsd) / 1_000_000).toFixed(6),
    autonomousRemainingUsd: Math.max(
      0,
      cap - Number(spentMicroUsd) / 1_000_000,
    ).toFixed(6),
    usingDefaultCap: !profile?.autonomousCapUsd,
  });
}
