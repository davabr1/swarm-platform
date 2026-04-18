import "server-only";
import type { Network, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { config } from "./config";
import { SelfFacilitatorClient } from "./selfFacilitator";
import { UVFacilitatorClient } from "./uvFacilitator";

// x402 facilitator client.
//
// Default is `self` — we run `@x402/evm`'s ExactEvmScheme in-process and sign
// `transferWithAuthorization` tx submissions from the treasury wallet. No
// third-party dependency; the treasury EOA that was already holding the
// commission fan-out + bounty payout key now also acts as our x402
// facilitator. This removes the hosted-facilitator single-point-of-failure
// (UltraViolet's live Rust service rejects every V2 envelope shape including
// its own SDK's output; x402.org's facilitator hasn't registered Fuji) and
// cuts one round-trip per request.
//
// Set `X402_FACILITATOR=uv` to go back to the UltraViolet HTTP adapter once
// their deserializer is fixed. Set `X402_FACILITATOR=hosted` (not yet wired)
// when x402.org adds Fuji support.
type FacilitatorClient = SelfFacilitatorClient | UVFacilitatorClient;
let _facilitator: FacilitatorClient | null = null;
export function facilitator(): FacilitatorClient {
  if (_facilitator) return _facilitator;
  const mode = (process.env.X402_FACILITATOR || "self").toLowerCase();
  if (mode === "uv") {
    _facilitator = new UVFacilitatorClient(config.facilitatorUrl);
  } else {
    _facilitator = new SelfFacilitatorClient();
  }
  return _facilitator;
}

// Where x402 payments land. Defaults to the existing treasury address —
// the treasury EOA is already load-bearing as the commission fanout
// signer, so consolidating inflow + fanout on the same wallet keeps
// operations simple. Override with PLATFORM_PAYOUT_ADDRESS if we later
// split custody from signing.
export function platformPayoutAddress(): string {
  const addr =
    process.env.PLATFORM_PAYOUT_ADDRESS || config.treasury.address;
  if (!addr) {
    throw new Error(
      "PLATFORM_PAYOUT_ADDRESS or TREASURY_ADDRESS required for x402 payments",
    );
  }
  return addr;
}

export interface BuildRequirementsOptions {
  priceMicroUsd: bigint;
  description: string;
  resource: string;
  payTo?: string;
  maxTimeoutSeconds?: number;
}

// Builds a PaymentRequirements object for the `exact` scheme on Fuji USDC.
//
// `extra.name` + `extra.version` are the Circle FiatTokenV2 EIP-712 domain —
// @x402/evm uses them to reconstruct the domain separator and recover the
// EIP-3009 `transferWithAuthorization` signature. USDC on every chain Circle
// controls uses { name: "USD Coin", version: "2" }.
//
// `extra.assetTransferMethod` is required by the V2 spec
// (docs.x402.org exact-scheme EVM): tells the client which token-side
// transfer mechanism the facilitator will submit. USDC implements EIP-3009
// natively; no Permit2 bounce needed.
export function buildPaymentRequirements(
  opts: BuildRequirementsOptions,
): PaymentRequirements {
  if (opts.priceMicroUsd <= BigInt(0)) {
    throw new Error("x402 price must be positive");
  }
  return {
    scheme: "exact",
    network: config.caip2 as Network,
    asset: config.usdcContract,
    amount: opts.priceMicroUsd.toString(),
    payTo: opts.payTo || platformPayoutAddress(),
    maxTimeoutSeconds: opts.maxTimeoutSeconds ?? 300,
    extra: {
      assetTransferMethod: "eip3009",
      name: "USD Coin",
      version: "2",
    },
  };
}

// Wraps PaymentRequirements in the 402 response envelope.
export function buildPaymentRequired(
  requirements: PaymentRequirements,
  opts: { description: string; resource: string; error?: string },
): PaymentRequired {
  return {
    x402Version: 2,
    error: opts.error,
    resource: {
      url: opts.resource,
      description: opts.description,
      mimeType: "application/json",
    },
    accepts: [requirements],
  };
}
