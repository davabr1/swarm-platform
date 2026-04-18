import "server-only";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";

// UltraViolet facilitator adapter.
//
// The public UltraViolet facilitator (facilitator.ultravioletadao.xyz) is our
// only option for on-chain Fuji settlement right now — x402.org's hosted
// facilitator advertises V2 but does not cover eip155:43113 in its supported
// matrix.
//
// UltraViolet's Rust service, however, predates the `@x402/core` v2 envelope
// refactor: it still wants the V1-style flat shape (`scheme`/`network` at the
// top of `paymentPayload`; `maxAmountRequired`/`resource`/`description`/
// `mimeType` on `paymentRequirements`). Even for V2 networks it rejects the
// canonical V2 shape with "data did not match any variant of untagged enum
// VerifyRequestEnvelope" — see
// https://facilitator.ultravioletadao.xyz/api-docs/openapi.json for the shape
// they publish.
//
// This adapter speaks the UltraViolet dialect on the wire but exposes the
// same `{ verify, settle }` surface as `HTTPFacilitatorClient` so the rest
// of our middleware code stays clean. When x402.org (or UltraViolet) ships
// V2-native deserialization we can drop this file and go back to
// `HTTPFacilitatorClient`.

export interface UVVerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  invalidMessage?: string;
  payer?: string;
  network?: string;
}

// Translate @x402/core V2 PaymentPayload → UltraViolet X402HeaderV2 shape.
// V2 stores `scheme`/`network` on `paymentPayload.accepted`; UV wants them
// at the top of `paymentPayload`. We keep `payload` (with the EIP-3009
// authorization + signature) unchanged — that part of the shape matches.
function toUvPaymentPayload(payload: PaymentPayload): Record<string, unknown> {
  if (payload.x402Version === 1) {
    return payload as unknown as Record<string, unknown>;
  }
  // V2
  const accepted = (payload as { accepted?: PaymentRequirements }).accepted;
  return {
    x402Version: 2,
    scheme: accepted?.scheme ?? "exact",
    network: accepted?.network,
    payload: (payload as { payload: unknown }).payload,
  };
}

// Translate @x402/core V2 PaymentRequirements → UltraViolet V1-style shape.
// UV's facilitator expects `maxAmountRequired` (not `amount`) plus
// `resource`/`description`/`mimeType` fields that the V2 PaymentRequirements
// type dropped in favor of the sibling ResourceInfo object. We backfill
// sensible defaults when the resource info wasn't plumbed through.
function toUvRequirements(
  requirements: PaymentRequirements,
  resource: string,
  description: string,
): Record<string, unknown> {
  const anyReqs = requirements as unknown as Record<string, unknown>;
  return {
    scheme: requirements.scheme,
    network: requirements.network,
    maxAmountRequired: anyReqs.amount ?? anyReqs.maxAmountRequired,
    resource,
    description,
    mimeType: "application/json",
    payTo: requirements.payTo,
    maxTimeoutSeconds: requirements.maxTimeoutSeconds,
    asset: requirements.asset,
    extra: requirements.extra,
  };
}

export interface UVFacilitatorOptions {
  url: string;
  resource: string;
  description: string;
}

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (process.env.X402_DEBUG === "1") {
    console.log(`[uv debug] POST ${url}`, JSON.stringify(body, null, 2));
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`UV facilitator ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export class UVFacilitatorClient {
  constructor(private readonly url: string) {}

  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
    opts: { resource: string; description: string },
  ): Promise<UVVerifyResponse> {
    const body = {
      x402Version: paymentPayload.x402Version,
      paymentPayload: toUvPaymentPayload(paymentPayload),
      paymentRequirements: toUvRequirements(
        paymentRequirements,
        opts.resource,
        opts.description,
      ),
    };
    return postJson<UVVerifyResponse>(`${this.url}/verify`, body);
  }

  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
    opts: { resource: string; description: string },
  ): Promise<SettleResponse> {
    const body = {
      x402Version: paymentPayload.x402Version,
      paymentPayload: toUvPaymentPayload(paymentPayload),
      paymentRequirements: toUvRequirements(
        paymentRequirements,
        opts.resource,
        opts.description,
      ),
    };
    const raw = await postJson<{
      success: boolean;
      transaction?: string;
      transactionHash?: string;
      network?: string;
      errorReason?: string;
      errorMessage?: string;
      error?: string;
      payer?: string;
    }>(`${this.url}/settle`, body);
    return {
      success: raw.success,
      transaction: raw.transaction || raw.transactionHash || "",
      network: (raw.network || paymentRequirements.network) as SettleResponse["network"],
      errorReason: raw.errorReason,
      errorMessage: raw.errorMessage || raw.error,
      payer: raw.payer,
    } as SettleResponse;
  }
}
