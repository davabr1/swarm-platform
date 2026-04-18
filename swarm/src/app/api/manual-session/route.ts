import type { NextRequest } from "next/server";
import { ethers } from "ethers";
import { mintManualSession, clearManualSession } from "@/lib/manualSession";

const MAX_AGE_MS = 5 * 60 * 1000;

// One-signature onboarding for browser-initiated agent calls.
//
// The cookie this mints is what lets subsequent /api/guidance and /api/image
// calls from the marketplace debit the signer's deposited balance silently,
// without a wallet prompt per call.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const address =
    typeof body.address === "string" ? body.address.toLowerCase() : null;
  const issuedAt =
    typeof body.issuedAt === "number" ? body.issuedAt : NaN;
  const signature: string | null =
    typeof body.signature === "string" ? body.signature : null;

  if (!address || !/^0x[a-f0-9]{40}$/.test(address)) {
    return Response.json({ error: "Invalid address" }, { status: 400 });
  }
  if (!Number.isFinite(issuedAt)) {
    return Response.json({ error: "Missing issuedAt" }, { status: 400 });
  }
  if (Math.abs(Date.now() - issuedAt) > MAX_AGE_MS) {
    return Response.json({ error: "Signature too old" }, { status: 400 });
  }
  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  const message = `Swarm manual session: ${address}@${issuedAt}`;
  let recovered = "";
  try {
    recovered = ethers.verifyMessage(message, signature).toLowerCase();
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  if (recovered !== address) {
    return Response.json({ error: "Signature does not match address" }, { status: 401 });
  }

  const { expiresAt } = await mintManualSession(address);
  return Response.json({
    success: true,
    address,
    expiresAt,
  });
}

export async function DELETE() {
  await clearManualSession();
  return Response.json({ success: true });
}
