"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAccount } from "wagmi";

// Legacy shim. The pre-x402 flow minted an httpOnly manual-session cookie
// for the browser; under x402 every paid call is independently signed by
// the connected wallet, so there's nothing to "ensure" before a call.
// This stays as a typed no-op to keep existing consumers compiling through
// the Phase 3 migration; Phase 4 deletes the provider outright.

interface SessionContextValue {
  address: string | null;
  hasSession: boolean;
  needsPairing: boolean;
  ensureSession: () => Promise<boolean>;
  clearSession: () => void;
}

const Ctx = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside <SessionProvider>");
  return v;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();

  const value = useMemo<SessionContextValue>(
    () => ({
      address: isConnected && address ? address.toLowerCase() : null,
      hasSession: isConnected,
      needsPairing: false,
      ensureSession: async () => isConnected,
      clearSession: () => {},
    }),
    [address, isConnected],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
