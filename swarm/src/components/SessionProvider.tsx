"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
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

// Fire-and-forget AVAX top-up on wallet connect. The server-side route is
// idempotent — it reads the live balance and no-ops if already funded — so
// it's safe to hit on every page with a connected wallet, and the ref-guard
// below keeps us from spamming during the same session.
function useAutoGasDrip(address: string | undefined, isConnected: boolean) {
  const lastAttempted = useRef<string | null>(null);
  useEffect(() => {
    if (!isConnected || !address) return;
    if (lastAttempted.current === address.toLowerCase()) return;
    lastAttempted.current = address.toLowerCase();
    fetch("/api/gas-drip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    }).catch(() => {});
  }, [address, isConnected]);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();

  useAutoGasDrip(address, isConnected);

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
