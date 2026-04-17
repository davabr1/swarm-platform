"use client";

import { useEffect, useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { SessionProvider } from "@/components/SessionProvider";

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

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ClientRainbowKit>
          <SessionProvider>{children}</SessionProvider>
        </ClientRainbowKit>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
