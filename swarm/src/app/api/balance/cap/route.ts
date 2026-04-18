import type { NextRequest } from "next/server";
import { ethers } from "ethers";
import { db } from "@/lib/db";

const MAX_AGE_MS = 5 * 60 * 1000;
// Upper bound kept generous so users can set whatever cap they want within
// reason. Acts as a guardrail against typos like "1000000" instead of "100".
const MAX_CAP_USDC = 10_000;

// Sets UserProfile.autonomousCapUsd. Signature gating: the caller proves
// wallet ownership with an EIP-191 signature over a deterministic message
// scoped to the cap value. Same pattern as /api/session/revoke.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const address =
    typeof body.address === "string" ? body.address.toLowerCase() : null;
  const capRaw =
    typeof body.autonomousCapUsd === "number"
      ? body.autonomousCapUsd
      : typeof body.autonomousCapUsd === "string"
        ? Number(body.autonomousCapUsd)
        : NaN;
  const issuedAt =
    typeof body.issuedAt === "number" ? body.issuedAt : NaN;
  const signature: string | null =
    typeof body.signature === "string" ? body.signature : null;

  if (!address || !/^0x[a-f0-9]{40}$/.test(address)) {
    return Response.json({ error: "Invalid address" }, { status: 400 });
  }
  if (!Number.isFinite(capRaw) || capRaw < 0 || capRaw > MAX_CAP_USDC) {
    return Response.json(
      { error: `Cap must be between 0 and ${MAX_CAP_USDC} USDC` },
      { status: 400 },
    );
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

  const capStr = capRaw.toString();
  const message = `Swarm autonomous allowance set: ${address}@${capStr}@${issuedAt}`;
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
    update: { autonomousCapUsd: capStr },
    create: { walletAddress: address, autonomousCapUsd: capStr },
  });

  return Response.json({ success: true, autonomousCapUsd: capStr });
}
