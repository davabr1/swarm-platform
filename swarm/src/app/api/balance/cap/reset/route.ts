import type { NextRequest } from "next/server";
import { ethers } from "ethers";
import { db } from "@/lib/db";

const MAX_AGE_MS = 5 * 60 * 1000;

// Zeroes UserProfile.autonomousSpentMicroUsd so the user gets back a full
// cap period without changing the cap itself. Signature-gated by the same
// pattern as the cap setter.
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

  const message = `Swarm autonomous cap reset: ${address}@${issuedAt}`;
  let recovered = "";
  try {
    recovered = ethers.verifyMessage(message, signature).toLowerCase();
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  if (recovered !== address) {
    return Response.json({ error: "Signature does not match address" }, { status: 401 });
  }

  await db.userProfile.upsert({
    where: { walletAddress: address },
    update: { autonomousSpentMicroUsd: BigInt(0) },
    create: { walletAddress: address },
  });

  return Response.json({ success: true });
}
