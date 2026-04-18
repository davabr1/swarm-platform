"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useBalance,
} from "wagmi";
import TerminalWindow from "./TerminalWindow";
import MCPRegistryABI from "@/abis/MCPRegistry.json";

const USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65" as const;
const FUJI_CHAIN_ID = 43113;
const REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_MCP_REGISTRY_ADDRESS || "") as `0x${string}` | "";

// Displays the set of MCP wallets the profile's owner has registered on
// MCPRegistry.sol. Each row shows the MCP's live USDC balance + an unlink
// button (only interactive when viewing your own profile). Empty state
// nudges toward `npx -y swarm-marketplace-mcp pair`.
export default function PairedMcpsPanel({
  address,
  isSelf,
}: {
  address: string;
  isSelf: boolean;
}) {
  const deployed = REGISTRY_ADDRESS.length > 0;
  const ownerArg = address as `0x${string}`;

  const { data: mcps, refetch } = useReadContract({
    address: deployed ? (REGISTRY_ADDRESS as `0x${string}`) : undefined,
    abi: MCPRegistryABI,
    functionName: "getMCPs",
    args: [ownerArg],
    chainId: FUJI_CHAIN_ID,
    query: { enabled: deployed, refetchInterval: 15_000 },
  }) as { data?: `0x${string}`[]; refetch: () => void };

  if (!deployed) {
    return (
      <TerminalWindow title="swarm://profile/mcps" subtitle="paired MCPs">
        <div className="p-5 text-[12px] text-dim leading-relaxed">
          On-chain MCP registry not deployed yet. Set{" "}
          <code className="text-foreground">NEXT_PUBLIC_MCP_REGISTRY_ADDRESS</code> to see your
          paired MCPs here.
        </div>
      </TerminalWindow>
    );
  }

  const list = (mcps ?? []) as `0x${string}`[];

  return (
    <TerminalWindow title="swarm://profile/mcps" subtitle={`paired MCPs · ${list.length}`}>
      <div className="p-5 space-y-3">
        {list.length === 0 ? (
          <div className="text-[12px] text-dim leading-relaxed">
            {isSelf ? (
              <>
                No MCPs paired yet. Run{" "}
                <code className="text-foreground">npx -y swarm-marketplace-mcp pair</code> to mint
                an MCP wallet — the CLI will print a{" "}
                <code className="text-foreground">/pair?mcpAddress=0x…</code> URL where you sign a
                one-time{" "}
                <code className="text-foreground">register</code> tx to link it to this wallet.
              </>
            ) : (
              <>This wallet has no paired MCPs.</>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border border border-border">
            {list.map((mcp) => (
              <McpRow
                key={mcp}
                mcp={mcp}
                isSelf={isSelf}
                onUnlinked={refetch}
              />
            ))}
          </div>
        )}
        <div className="text-[10px] text-dim leading-relaxed pt-2 border-t border-border">
          Each MCP holds its own USDC on Fuji and signs x402 payments per call. Fund an MCP by
          sending USDC to its address. Unlink only removes the on-chain link — leftover USDC at the
          MCP address is still yours (sweep by importing the private key into any wallet app).
        </div>
      </div>
    </TerminalWindow>
  );
}

function McpRow({
  mcp,
  isSelf,
  onUnlinked,
}: {
  mcp: `0x${string}`;
  isSelf: boolean;
  onUnlinked: () => void;
}) {
  const { data: balance } = useBalance({
    address: mcp,
    token: USDC_FUJI,
    chainId: FUJI_CHAIN_ID,
    query: { refetchInterval: 15_000 },
  });
  const { data: pairedAt } = useReadContract({
    address: REGISTRY_ADDRESS as `0x${string}`,
    abi: MCPRegistryABI,
    functionName: "pairedAt",
    args: [mcp],
    chainId: FUJI_CHAIN_ID,
  }) as { data?: bigint };

  const {
    writeContract,
    data: hash,
    isPending,
    error,
  } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
    chainId: FUJI_CHAIN_ID,
  });

  useEffect(() => {
    if (isSuccess) onUnlinked();
  }, [isSuccess, onUnlinked]);

  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mcp);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {}
  }, [mcp]);

  const onUnlink = () => {
    writeContract({
      address: REGISTRY_ADDRESS as `0x${string}`,
      abi: MCPRegistryABI,
      functionName: "unregister",
      args: [mcp],
      chainId: FUJI_CHAIN_ID,
    });
  };

  const microUsd = balance?.value ?? BigInt(0);
  const balanceStr = balance
    ? (Number(microUsd) / 1_000_000).toFixed(microUsd < BigInt(1_000_000) ? 3 : 2)
    : "—";
  const pairedAgo = pairedAt ? timeAgoSec(Number(pairedAt)) : "—";

  return (
    <div className="px-4 py-3 text-[12px]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-foreground break-all">{mcp}</div>
          <div className="text-[10px] text-dim mt-1 flex items-center gap-3 flex-wrap">
            <span>
              balance · <span className="text-phosphor">{balanceStr} USDC</span>
            </span>
            <span>
              paired · <span className="text-muted">{pairedAgo}</span>
            </span>
            <a
              href={`https://testnet.snowtrace.io/address/${mcp}`}
              target="_blank"
              rel="noreferrer"
              className="text-dim hover:text-amber underline"
            >
              snowtrace ↗
            </a>
            <a
              href={`/pair?mcpAddress=${mcp}`}
              className="text-dim hover:text-amber underline"
            >
              fund ↗
            </a>
            <button
              onClick={copy}
              className="text-dim hover:text-foreground"
            >
              {copied ? "copied ✓" : "copy"}
            </button>
          </div>
        </div>
        {isSelf && (
          <button
            onClick={onUnlink}
            disabled={isPending || confirming}
            className="border border-danger text-danger text-[10px] px-3 py-1 hover:bg-danger hover:text-background disabled:opacity-50 transition-none"
          >
            {isPending
              ? "[ signing… ]"
              : confirming
                ? "[ confirming… ]"
                : "[ unlink ]"}
          </button>
        )}
      </div>
      {error && (
        <div className="text-[11px] text-danger mt-2">
          {error.message.slice(0, 150)}
        </div>
      )}
    </div>
  );
}

function timeAgoSec(secEpoch: number): string {
  if (!secEpoch) return "—";
  const s = Math.floor(Date.now() / 1000 - secEpoch);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
