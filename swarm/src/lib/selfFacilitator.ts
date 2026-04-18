import "server-only";
import { createWalletClient, http, publicActions } from "viem";
import { avalancheFuji } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { toFacilitatorEvmSigner } from "@x402/evm";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { config } from "./config";

// Self-hosted x402 facilitator.
//
// The public UltraViolet facilitator is the only hosted service that currently
// advertises Fuji (eip155:43113), but its live Rust deployment rejects every
// envelope shape — including the one produced by UltraViolet's own public
// SDK. x402.org's facilitator accepts the canonical V2 shape cleanly but has
// not registered a scheme for Fuji. Both third-party options are therefore
// unusable for the demo.
//
// `@x402/evm` ships the exact-scheme facilitator logic (EIP-3009 signature
// recovery + `transferWithAuthorization` submission) as a library. All we
// need is a wallet with Fuji AVAX for gas — the treasury EOA already qualifies.
// We wrap it in the same `{ verify, settle }` shape as `UVFacilitatorClient`
// so `x402Middleware` is agnostic to whether the facilitator is local or
// remote.
//
// Flip back to a hosted facilitator by setting `X402_FACILITATOR=hosted` once
// one supports Fuji V2.

let _scheme: ExactEvmScheme | null = null;

function scheme(): ExactEvmScheme {
  if (_scheme) return _scheme;
  if (!config.treasury.privateKey) {
    throw new Error(
      "TREASURY_PRIVATE_KEY required — self-hosted x402 facilitator signs settle txs from the treasury wallet",
    );
  }
  const account = privateKeyToAccount(
    config.treasury.privateKey as `0x${string}`,
  );
  const client = createWalletClient({
    account,
    chain: avalancheFuji,
    transport: http(config.rpc),
  }).extend(publicActions);
  // `toFacilitatorEvmSigner` expects a slightly stricter typed-data shape
  // than viem's `WalletClient & PublicClient` exposes (viem models EIP-712
  // `types` more tightly than @x402/evm's `Record<string, unknown>`).
  // Runtime-proven compatible — the smoke test in Phase 1 round-trips
  // successfully; cast via unknown to satisfy the structural check.
  const signer = toFacilitatorEvmSigner(
    client as unknown as Parameters<typeof toFacilitatorEvmSigner>[0],
  );
  _scheme = new ExactEvmScheme(signer);
  return _scheme;
}

export class SelfFacilitatorClient {
  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
    // Third arg is kept for call-site symmetry with UVFacilitatorClient; the
    // self-hosted path derives resource/description from the payload itself.
    _opts: { resource: string; description: string },
  ): Promise<VerifyResponse & { network?: string }> {
    return scheme().verify(paymentPayload, paymentRequirements);
  }

  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
    _opts: { resource: string; description: string },
  ): Promise<SettleResponse> {
    return scheme().settle(paymentPayload, paymentRequirements);
  }
}
