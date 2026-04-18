// x402 smoke-test route. Charges $0.001 USDC on Fuji via the exact scheme.
//
// First hit (no X-PAYMENT): returns 402 + PaymentRequired envelope.
// Second hit (with valid X-PAYMENT): facilitator settles on-chain, returns
// 200 + X-PAYMENT-RESPONSE header containing the tx hash.
//
// Delete this route after Phase 2 ships (guidance route proves the flow
// end-to-end in production). Kept temporarily so Phase 1 can be verified
// standalone with curl + a tsx signer script.

import { NextResponse } from "next/server";
import { requireX402Payment } from "@/lib/x402Middleware";

export const dynamic = "force-dynamic";

const PRICE_MICRO_USD = BigInt(1000); // $0.001

export async function GET(req: Request) {
  const gate = await requireX402Payment(req, {
    priceResolver: () => PRICE_MICRO_USD,
    description: "x402 smoke test — $0.001 USDC",
    resource: "/api/x402-demo",
  });

  if (gate.kind === "challenge") return gate.response;

  // Nothing to do for a smoke test — settle immediately.
  const { response, paymentResponseHeader } = await gate.settle();

  return NextResponse.json(
    {
      ok: true,
      payer: gate.payer,
      amountMicroUsd: PRICE_MICRO_USD.toString(),
      settlementTxHash: response.transaction,
      network: response.network,
    },
    {
      headers: {
        "PAYMENT-RESPONSE": paymentResponseHeader,
        "X-PAYMENT-RESPONSE": paymentResponseHeader,
      },
    },
  );
}
