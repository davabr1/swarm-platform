"use client";

import { useMemo, useRef } from "react";
import { useAccount, useWalletClient } from "wagmi";
import {
  buildX402BrowserFetch,
  type X402BrowserFetchHooks,
} from "./x402BrowserFetch";

// React hook wrapping `buildX402BrowserFetch`. Returns null until a wallet
// is connected and its WalletClient is ready. Consumers should guard on
// null before firing paid calls — otherwise fall back to the connect-wallet
// prompt.
//
// Returns both the fetch and a ref for optional payment-lifecycle hooks
// (`onSigningStart` / `onSigned`). Consumers can mutate `hooksRef.current`
// any time — the fetch stays stable even as hook closures change, so we
// don't recreate the x402 client on every render.
export function useX402Fetch(): {
  fetch: typeof fetch | null;
  hooksRef: React.MutableRefObject<X402BrowserFetchHooks | null>;
} {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const hooksRef = useRef<X402BrowserFetchHooks | null>(null);

  const fetchImpl = useMemo(() => {
    if (!isConnected || !address || !walletClient) return null;
    try {
      return buildX402BrowserFetch(walletClient, hooksRef);
    } catch {
      return null;
    }
  }, [isConnected, address, walletClient]);

  return { fetch: fetchImpl, hooksRef };
}
