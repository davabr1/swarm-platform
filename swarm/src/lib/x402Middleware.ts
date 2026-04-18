import "server-only";
import { NextResponse } from "next/server";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import {
  buildPaymentRequired,
  buildPaymentRequirements,
  facilitator,
} from "./x402";

export interface RequirePaymentOptions {
  // Resolves dynamic price per request (guidance = commission + gemini +
  // margin). Return the total in micro-USDC.
  priceResolver: () => Promise<bigint> | bigint;
  description: string;
  // Logical resource identifier shown in the 402 envelope; usually the
  // route path.
  resource: string;
  payTo?: string;
  maxTimeoutSeconds?: number;
}

export type X402Gate =
  | {
      kind: "challenge";
      response: NextResponse;
    }
  | {
      kind: "verified";
      payer: string;
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
      priceMicroUsd: bigint;
      // Settles the payment via the facilitator. Call after the work is
      // complete so partial work doesn't get charged. Returns the on-chain
      // settle tx hash + the base64 X-PAYMENT-RESPONSE header value the
      // caller must attach to the final response.
      settle: () => Promise<{
        response: SettleResponse;
        paymentResponseHeader: string;
      }>;
    };

// Core x402 gate used by every paid route.
//
// Flow:
//   1. Compute price via priceResolver.
//   2. Build PaymentRequirements.
//   3. If no `X-PAYMENT` header: return { kind: "challenge", response: 402 }.
//      Caller returns that response.
//   4. Else: decode payload, call facilitator.verify().
//      - Invalid → { kind: "challenge", response: 402 with error }.
//      - Valid → { kind: "verified", payer, settle }. Caller runs the work,
//        then awaits settle().
//
// The settle() closure is deferred so the caller controls the order:
//   const gate = await requireX402Payment(req, { ... });
//   if (gate.kind === "challenge") return gate.response;
//   const result = await doWork(gate.payer);
//   const { paymentResponseHeader } = await gate.settle();
//   return NextResponse.json(result, { headers: { "X-PAYMENT-RESPONSE": paymentResponseHeader } });
export async function requireX402Payment(
  req: Request,
  opts: RequirePaymentOptions,
): Promise<X402Gate> {
  const priceMicroUsd = BigInt(await opts.priceResolver());
  const paymentRequirements = buildPaymentRequirements({
    priceMicroUsd,
    description: opts.description,
    resource: opts.resource,
    payTo: opts.payTo,
    maxTimeoutSeconds: opts.maxTimeoutSeconds,
  });

  // V2 clients send PAYMENT-SIGNATURE; V1 clients send X-PAYMENT. Accept
  // both so the same route works with either generation of @x402/fetch.
  const paymentHeader =
    req.headers.get("payment-signature") || req.headers.get("x-payment");

  if (!paymentHeader) {
    return {
      kind: "challenge",
      response: challenge(paymentRequirements, opts),
    };
  }

  let paymentPayload: PaymentPayload;
  try {
    paymentPayload = decodePaymentSignatureHeader(paymentHeader);
  } catch (err) {
    return {
      kind: "challenge",
      response: challenge(paymentRequirements, opts, {
        error: `invalid X-PAYMENT header: ${errMsg(err)}`,
      }),
    };
  }

  let verifyResult;
  try {
    if (process.env.X402_DEBUG === "1") {
      console.log(
        "[x402 debug] verify payload:",
        JSON.stringify(paymentPayload, null, 2),
      );
      console.log(
        "[x402 debug] verify requirements:",
        JSON.stringify(paymentRequirements, null, 2),
      );
    }
    verifyResult = await facilitator().verify(
      paymentPayload,
      paymentRequirements,
      { resource: opts.resource, description: opts.description },
    );
  } catch (err) {
    return {
      kind: "challenge",
      response: challenge(paymentRequirements, opts, {
        error: `facilitator verify failed: ${errMsg(err)}`,
      }),
    };
  }

  if (!verifyResult.isValid) {
    return {
      kind: "challenge",
      response: challenge(paymentRequirements, opts, {
        error:
          verifyResult.invalidMessage ||
          verifyResult.invalidReason ||
          "payment verification failed",
      }),
    };
  }

  const payer = verifyResult.payer || (paymentPayload.payload as { from?: string }).from || "";
  if (!payer) {
    return {
      kind: "challenge",
      response: challenge(paymentRequirements, opts, {
        error: "facilitator verify did not return a payer address",
      }),
    };
  }

  return {
    kind: "verified",
    payer: payer.toLowerCase(),
    paymentPayload,
    paymentRequirements,
    priceMicroUsd,
    settle: async () => {
      const response = await facilitator().settle(
        paymentPayload,
        paymentRequirements,
        { resource: opts.resource, description: opts.description },
      );
      if (!response.success) {
        throw new Error(
          `x402 settlement failed: ${response.errorMessage || response.errorReason || "unknown"}`,
        );
      }
      return {
        response,
        paymentResponseHeader: encodePaymentResponseHeader(response),
      };
    },
  };
}

function challenge(
  paymentRequirements: PaymentRequirements,
  opts: RequirePaymentOptions,
  extra?: { error?: string },
): NextResponse {
  const body = buildPaymentRequired(paymentRequirements, {
    description: opts.description,
    resource: opts.resource,
    error: extra?.error,
  });
  // V2 clients (@x402/fetch) parse the envelope from the PAYMENT-REQUIRED
  // header (base64 JSON). We still mirror it into the body for humans and
  // curl-based debugging.
  return NextResponse.json(body, {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": encodePaymentRequiredHeader(body),
    },
  });
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
