"use client";

import { useEffect, useState, type ReactNode } from "react";
import { WagmiProvider, useAccount } from "wagmi";
import { reconnect } from "@wagmi/core";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { SessionProvider } from "@/components/SessionProvider";

// Key in localStorage that tracks "user explicitly clicked disconnect on this
// device." If present, we skip wagmi's auto-reconnect on mount — otherwise the
// injected connector happily resurrects the session because the extension is
// still authorized for the site. Cleared by `DisconnectFlagGuard` as soon as
// the user explicitly reconnects.
const USER_DISCONNECTED_KEY = "swarm:user-disconnected";

// Watches for an explicit (re)connection and clears the disconnect flag so
// the user's next refresh will auto-reconnect normally. Placed inside
// WagmiProvider because it needs `useAccount`.
function DisconnectFlagGuard() {
  const { isConnected } = useAccount();
  useEffect(() => {
    if (!isConnected || typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(USER_DISCONNECTED_KEY);
    } catch {}
  }, [isConnected]);
  return null;
}

/**
 * RainbowKitProvider internally calls getRecentWalletIds() which reads from
 * localStorage — fine in the browser, but during Next.js SSR window.localStorage
 * is a shim that throws. We mount-gate RainbowKit so it only renders client-side
 * while keeping WagmiProvider on both server + client so hooks like useAccount
 * don't panic with "useConfig must be used within WagmiProvider".
 */
function ClientRainbowKit({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <>{children}</>;

  return (
    <RainbowKitProvider
      theme={darkTheme({
        accentColor: "#f59e0b",
        accentColorForeground: "#08080a",
        borderRadius: "none",
        fontStack: "system",
        overlayBlur: "small",
      })}
      showRecentTransactions={false}
    >
      {children}
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // We disable wagmi's built-in `reconnectOnMount` and do it ourselves so
  // that an intentional disconnect actually sticks across refresh. wagmi's
  // default eagerly rehydrates from storage and — because the injected
  // connector is still authorized inside the browser extension — the
  // connection comes right back even after a clean disconnect.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(USER_DISCONNECTED_KEY) === "1") return;
    } catch {
      // localStorage unavailable (private mode, etc.) — fall through and try.
    }
    reconnect(wagmiConfig).catch(() => {
      // No previously-authorized connector or user cancelled — fine.
    });
  }, []);

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <DisconnectFlagGuard />
        <ClientRainbowKit>
          <SessionProvider>{children}</SessionProvider>
        </ClientRainbowKit>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
