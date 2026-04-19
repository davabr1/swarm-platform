import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { maybeDripAvax } from "@/lib/gasDrip";

export const runtime = "nodejs";

// POST /api/gas-drip
// Body: { address: "0x..." }
//
// Tops up the caller's Fuji AVAX if it's below the threshold. Idempotent —
// safe to spam on every wallet-connect. The drip amount is small enough
// that abuse is self-limiting: a funded wallet falls through immediately,
// and treasury AVAX on Fuji is free.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { address?: string };
    const address = body.address?.trim();
    if (!address) {
      return NextResponse.json({ error: "missing_address" }, { status: 400 });
    }
    const result = await maybeDripAvax(address);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
