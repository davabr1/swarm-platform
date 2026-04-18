import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
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

  // Null allowance = user hasn't set one. Autonomous spend is then bounded
  // only by deposited balance. The frontend uses `autonomousCapSet` to
  // render the "— cap / balance remaining" readout and the save/reset UI.
  const capSet = !!profile?.autonomousCapUsd;
  const cap = capSet ? Number(profile!.autonomousCapUsd) : 0;
  const capMicroUsd = BigInt(Math.round(cap * 1_000_000));
  const balanceMicroUsd = profile?.balanceMicroUsd ?? BigInt(0);
  const spentMicroUsd = profile?.autonomousSpentMicroUsd ?? BigInt(0);
  const balanceUsd = Number(balanceMicroUsd) / 1_000_000;
  const spentUsd = Number(spentMicroUsd) / 1_000_000;

  return Response.json({
    address,
    balanceMicroUsd: balanceMicroUsd.toString(),
    balanceUsd: balanceUsd.toFixed(6),
    autonomousCapMicroUsd: capMicroUsd.toString(),
    autonomousCapUsd: cap.toFixed(6),
    autonomousCapSet: capSet,
    autonomousSpentMicroUsd: spentMicroUsd.toString(),
    autonomousSpentUsd: spentUsd.toFixed(6),
    // Effective remaining = what the next MCP call can actually spend.
    // With no allowance set, it's just the deposited balance; with one
    // set, it's the lesser of (allowance − used) and deposited balance.
    autonomousRemainingUsd: (capSet
      ? Math.max(0, Math.min(cap - spentUsd, balanceUsd))
      : balanceUsd
    ).toFixed(6),
    // Deprecated alias — kept for older clients. `autonomousCapSet` is the
    // canonical flag going forward.
    usingDefaultCap: !capSet,
  });
}
