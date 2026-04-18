"use client";

import { useMemo } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { buildX402BrowserFetch } from "./x402BrowserFetch";

// React hook wrapping `buildX402BrowserFetch`. Returns null until a wallet
// is connected and its WalletClient is ready. Consumers should guard on
// null before firing paid calls — otherwise fall back to the connect-wallet
// prompt.
export function useX402Fetch(): typeof fetch | null {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  return useMemo(() => {
    if (!isConnected || !address || !walletClient) return null;
    try {
      return buildX402BrowserFetch(walletClient);
    } catch {
      return null;
    }
  }, [isConnected, address, walletClient]);
}
