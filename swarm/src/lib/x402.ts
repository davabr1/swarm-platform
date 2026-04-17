import "server-only";
import type { NextRequest } from "next/server";
import { config } from "./config";
import {
  classifyTransferError,
  transferFrom,
  type TransferFailure,
} from "./usdc";

export interface X402Charge {
  price: string;
  payTo: string;
  description?: string;
  simulated: boolean;
}

// Legacy HOF kept for drop-in compatibility with any call-sites still using
// it. Paid routes in Phase 2+ call `settleCall` directly instead.
type RouteConfig = { price: string; payTo: string; description?: string } | null;
type RouteHandler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<Response> | Response;
type WrappedHandler<Ctx> = (
  req: NextRequest,
  ctx: Ctx,
  charge: X402Charge | null,
) => Promise<Response> | Response;

export function withX402<Ctx>(
  resolve: (req: NextRequest, ctx: Ctx) => Promise<RouteConfig> | RouteConfig,
  handler: WrappedHandler<Ctx>,
): RouteHandler<Ctx> {
  return async (req, ctx) => {
    const route = await resolve(req, ctx);
    const charge: X402Charge | null = route
      ? { price: route.price, payTo: route.payTo, description: route.description, simulated: !config.x402Enforce }
      : null;
    return handler(req, ctx, charge);
  };
}

// === Phase 2: real settlement via pre-approved allowance ===

export interface SettlementSuccess {
  ok: true;
  txHash: string;
  blockNumber: number;
  status: "confirmed" | "simulated";
}

export interface SettlementPayerError {
  ok: false;
  payerError: true;
  kind: "allowance_exhausted" | "insufficient_balance";
  message: string;
}

export interface SettlementServerError {
  ok: false;
  payerError: false;
  kind: "rpc_error" | "other";
  message: string;
}

export type SettlementResult =
  | SettlementSuccess
  | SettlementPayerError
  | SettlementServerError;

export interface SettleArgs {
  payer: string;
  payTo: string;
  microUsdc: bigint;
  description?: string;
}

// Pulls `microUsdc` USDC from the payer to payTo via the orchestrator's
// pre-approved allowance. When X402_ENFORCE=false (local dev), skips the
// on-chain move and returns a "simulated" success so routes can still
// persist the row and return 200.
export async function settleCall(args: SettleArgs): Promise<SettlementResult> {
  if (!config.x402Enforce) {
    return {
      ok: true,
      txHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      blockNumber: 0,
      status: "simulated",
    };
  }
  if (args.microUsdc <= BigInt(0)) {
    // Zero-cost calls (platform agents with no commission AND negligible
    // Gemini cost rounded to 0) don't need a tx. Treat as confirmed no-op.
    return {
      ok: true,
      txHash: "0x0",
      blockNumber: 0,
      status: "simulated",
    };
  }
  try {
    const { txHash, blockNumber } = await transferFrom(args.payer, args.payTo, args.microUsdc);
    return { ok: true, txHash, blockNumber, status: "confirmed" };
  } catch (err) {
    const failure: TransferFailure = classifyTransferError(err);
    if (failure.kind === "allowance_exhausted" || failure.kind === "insufficient_balance") {
      return { ok: false, payerError: true, kind: failure.kind, message: failure.message };
    }
    return { ok: false, payerError: false, kind: failure.kind, message: failure.message };
  }
}

// Shape of the JSON body included with any 402 response. Follows the
// x402 protocol's X-PAYMENT-REQUIRED convention at a high level — enough
// that downstream clients can inspect price + payTo + chain. We don't
// advertise EIP-3009 as a supported scheme because our settlement is
// via pre-approved allowance (see AVALANCHE_WIRING.md Phase 2 notes).
export interface PaymentRequired {
  version: number;
  accepts: Array<{
    scheme: "allowance";
    network: string; // CAIP-2
    maxAmountRequired: string; // micro-USDC as decimal string
    resource: string;
    description?: string;
    payTo: string;
    asset: string;
    maxTimeoutSeconds: number;
  }>;
  error?: string;
  detail?: Record<string, unknown>;
}

export function buildPaymentRequired(params: {
  resource: string;
  microUsdc: bigint;
  description?: string;
  error?: string;
  detail?: Record<string, unknown>;
  payTo?: string;
}): PaymentRequired {
  return {
    version: 2,
    accepts: [
      {
        scheme: "allowance",
        network: config.caip2,
        maxAmountRequired: params.microUsdc.toString(),
        resource: params.resource,
        description: params.description,
        payTo: params.payTo ?? config.orchestrator.address,
        asset: config.usdcContract,
        maxTimeoutSeconds: 60,
      },
    ],
    error: params.error,
    detail: params.detail,
  };
}

// Encodes a settlement receipt for the X-PAYMENT-RESPONSE header.
// Base64-JSON so browsers and MCP clients can both read it without TLS
// header-length worries on typical receipts.
export function paymentResponseHeader(success: SettlementSuccess): string {
  const payload = {
    success: true,
    txHash: success.txHash,
    blockNumber: success.blockNumber,
    status: success.status,
    network: config.caip2,
    asset: config.usdcContract,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

// HTTP status + body builder used by routes when they need to 402 the
// caller. Always sets X-PAYMENT-REQUIRED as a base64-JSON header so
// clients can parse the challenge either from the header or body.
export function json402(params: {
  resource: string;
  microUsdc: bigint;
  error: string;
  description?: string;
  detail?: Record<string, unknown>;
}): Response {
  const body = buildPaymentRequired(params);
  const header = Buffer.from(JSON.stringify(body), "utf8").toString("base64");
  return new Response(JSON.stringify(body), {
    status: 402,
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT-REQUIRED": header,
    },
  });
}
