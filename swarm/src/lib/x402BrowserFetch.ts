"use client";

import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm";
import type { WalletClient } from "viem";

// Optional instrumentation hooks used by UI layers to report the payment
// lifecycle in real time. Called from inside `signTypedData`, which runs
// exactly once per 402 → retry handshake. `amountMicroUsd` is parsed from
// the EIP-3009 `value` field; `to` is the payment recipient encoded in the
// server's payment requirement.
export interface X402BrowserFetchHooks {
  onSigningStart?: (info: { amountMicroUsd: bigint; to: string }) => void;
  onSigned?: (info: { amountMicroUsd: bigint; to: string }) => void;
}

// Builds an x402-aware fetch bound to a wagmi/viem WalletClient. Every call
// through the returned fetch auto-handles 402: a typed-data prompt opens in
// the user's wallet, the signature is attached as `X-PAYMENT`, and the
// request retries. Paid routes settle on Fuji in ~2s; free routes pass
// through untouched.
//
// Call per-wallet (memoize in a `useMemo` keyed on `walletClient.uid` or the
// account address) — rebuilding on every render works but re-runs
// client registration.
export function buildX402BrowserFetch(
  walletClient: WalletClient,
  hooksRef?: { current: X402BrowserFetchHooks | null },
): typeof fetch {
  const account = walletClient.account;
  if (!account) {
    throw new Error("walletClient must have an account");
  }

  const signer = {
    address: account.address,
    signTypedData: async (msg: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }): Promise<`0x${string}`> => {
      const valueRaw = msg.message.value;
      const toRaw = msg.message.to;
      const amountMicroUsd =
        typeof valueRaw === "bigint"
          ? valueRaw
          : typeof valueRaw === "string" || typeof valueRaw === "number"
            ? BigInt(valueRaw)
            : BigInt(0);
      const to = typeof toRaw === "string" ? toRaw : "";
      hooksRef?.current?.onSigningStart?.({ amountMicroUsd, to });
      const sig = await walletClient.signTypedData({
        account,
        domain: msg.domain as Parameters<typeof walletClient.signTypedData>[0]["domain"],
        types: msg.types as Parameters<typeof walletClient.signTypedData>[0]["types"],
        primaryType: msg.primaryType,
        message: msg.message,
      });
      hooksRef?.current?.onSigned?.({ amountMicroUsd, to });
      return sig;
    },
  };

  const scheme = new ExactEvmScheme(signer);
  const client = new x402Client().register("eip155:43113", scheme);
  return wrapFetchWithPayment(fetch, client) as typeof fetch;
}
