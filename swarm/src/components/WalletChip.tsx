"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { fetchBalance } from "@/lib/api";
import { FUJI_CHAIN_ID, MCP_REGISTRY_ADDRESS, USDC_ERC20_ABI, USDC_FUJI } from "@/lib/fuji";
import MCPRegistryABI from "@/abis/MCPRegistry.json";

// Shows combined on-chain USDC buying power: main wallet + every paired MCP.
// Hover reveals the per-wallet breakdown so users can see at a glance where
// their funds sit without leaving whichever page they're on.
function CombinedBalance({ address }: { address: `0x${string}` }) {
  const [mainUsdc, setMainUsdc] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchBalance(address)
        .then((b) => {
          if (!cancelled) setMainUsdc(Number(b.balanceUsd));
        })
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [address]);

  const registryDeployed = MCP_REGISTRY_ADDRESS.length > 0;

  const { data: mcps } = useReadContract({
    address: registryDeployed ? (MCP_REGISTRY_ADDRESS as `0x${string}`) : undefined,
    abi: MCPRegistryABI,
    functionName: "getMCPs",
    args: [address],
    chainId: FUJI_CHAIN_ID,
    query: { enabled: registryDeployed, refetchInterval: 15_000 },
  }) as { data?: `0x${string}`[] };

  const mcpList = useMemo(() => (mcps ?? []) as `0x${string}`[], [mcps]);

  const { data: mcpBalances } = useReadContracts({
    contracts: mcpList.map(
      (mcp) =>
        ({
          address: USDC_FUJI,
          abi: USDC_ERC20_ABI,
          functionName: "balanceOf",
          args: [mcp],
          chainId: FUJI_CHAIN_ID,
        }) as const,
    ),
    query: { enabled: mcpList.length > 0, refetchInterval: 15_000 },
  });

  const mcpBalanceMap = useMemo(() => {
    const out: Record<string, number> = {};
    mcpList.forEach((mcp, i) => {
      const entry = mcpBalances?.[i];
      if (entry?.status === "success") {
        out[mcp] = Number(entry.result as bigint) / 1_000_000;
      } else {
        out[mcp] = 0;
      }
    });
    return out;
  }, [mcpBalances, mcpList]);

  const mcpSum = useMemo(
    () => Object.values(mcpBalanceMap).reduce((a, b) => a + b, 0),
    [mcpBalanceMap],
  );

  const hasMain = mainUsdc !== null;
  const total = (mainUsdc ?? 0) + mcpSum;
  const displayed = hasMain ? total.toFixed(2) : "—";
  const hasBreakdown = mcpList.length > 0;

  return (
    <div className="relative group">
      <span className="hidden sm:inline text-dim tabular-nums">
        {displayed}
        <span className="text-dim/70"> USDC</span>
      </span>
      {hasBreakdown && (
        <div
          className="
            absolute right-0 top-full pt-3 w-72
            z-50 text-xs
            opacity-0 invisible
            group-hover:opacity-100 group-hover:visible
            transition-none
          "
        >
         <div className="border border-border-hi bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
          <div className="px-3 py-2 border-b border-border text-[10px] uppercase tracking-widest text-dim">
            buying power · {total.toFixed(2)} USDC
          </div>
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-muted">main wallet</span>
            <span className="text-foreground tabular-nums">
              {hasMain ? (mainUsdc ?? 0).toFixed(2) : "—"}
            </span>
          </div>
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-dim border-b border-border">
            paired MCPs · {mcpList.length}
          </div>
          {mcpList.map((mcp) => (
            <div
              key={mcp}
              className="px-3 py-1.5 flex items-center justify-between gap-2 border-b border-border last:border-b-0"
            >
              <span className="text-muted font-mono text-[11px]">
                {mcp.slice(0, 6)}…{mcp.slice(-4)}
              </span>
              <span className="text-phosphor tabular-nums">
                {mcpBalanceMap[mcp].toFixed(
                  mcpBalanceMap[mcp] > 0 && mcpBalanceMap[mcp] < 1 ? 3 : 2,
                )}
              </span>
            </div>
          ))}
         </div>
        </div>
      )}
    </div>
  );
}

export default function WalletChip() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="h-8 px-3 flex items-center text-xs text-dim border border-border">
        [ …loading ]
      </div>
    );
  }

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openChainModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!ready) {
          return (
            <div className="h-8 px-3 flex items-center text-xs text-dim border border-border">
              [ …loading ]
            </div>
          );
        }

        if (!connected) {
          return (
            <button
              onClick={openConnectModal}
              className="h-8 px-3 flex items-center gap-2 text-xs text-amber border border-amber/40 hover:bg-amber hover:text-background transition-none"
            >
              <span className="w-1.5 h-1.5 bg-amber" />
              [ connect wallet ]
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              onClick={openChainModal}
              className="h-8 px-3 flex items-center gap-2 text-xs text-danger border border-danger/40 hover:bg-danger hover:text-background transition-none"
            >
              [ wrong network ]
            </button>
          );
        }

        const short = `${account.address.slice(0, 6)}…${account.address.slice(-4)}`;
        const label =
          account.displayName && account.displayName !== account.address
            ? account.displayName
            : short;

        return (
          <Link
            href="/profile"
            className="h-8 px-3 flex items-center gap-2 text-xs border border-border-hi text-foreground hover:border-amber hover:text-amber transition-none"
          >
            <span className="w-1.5 h-1.5 bg-phosphor" />
            <CombinedBalance address={account.address as `0x${string}`} />
            <span className="text-dim/40">·</span>
            [ {label} ]
          </Link>
        );
      }}
    </ConnectButton.Custom>
  );
}
