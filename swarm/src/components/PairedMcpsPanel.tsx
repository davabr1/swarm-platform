"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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

// Minimal ERC-20 ABI for the top-up path (user wallet → their own MCP).
// Not x402 — a plain `USDC.transfer(to, microUsdc)` call signed by the
// browser wallet. Allows 1-click top-up without leaving the profile page.
const USDC_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const TOPUP_PRESETS_USDC = [1, 5, 10, 25] as const;

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
          <div className="text-[12px] text-dim leading-relaxed space-y-2">
            {isSelf ? (
              <>
                <div className="text-foreground font-semibold">No MCPs paired yet.</div>
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    Run <code className="text-foreground">npx -y swarm-marketplace-mcp pair</code>{" "}
                    — it mints a wallet for your agent.
                  </li>
                  <li>Fund the printed address with Fuji USDC.</li>
                  <li>
                    Add the MCP to your agent (Claude Code, Claude Desktop, Cursor, Codex, or any
                    MCP-capable client).
                  </li>
                </ol>
                <div className="pt-1">
                  Full walkthrough at{" "}
                  <Link href="/configure" className="text-amber underline hover:text-amber-hi">
                    /configure
                  </Link>
                  .
                </div>
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
  const { data: balance, refetch: refetchBalance } = useBalance({
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

  // Unlink and top-up use separate write hooks so the two flows don't
  // clobber each other's pending state. Both operate on the same row but
  // go to different contracts (registry vs USDC).
  const {
    writeContract: writeUnlink,
    data: unlinkHash,
    isPending: unlinkPending,
    error: unlinkError,
  } = useWriteContract();
  const { isLoading: unlinkConfirming, isSuccess: unlinkDone } = useWaitForTransactionReceipt({
    hash: unlinkHash,
    chainId: FUJI_CHAIN_ID,
  });

  const {
    writeContract: writeTopup,
    data: topupHash,
    isPending: topupPending,
    error: topupError,
  } = useWriteContract();
  const { isLoading: topupConfirming, isSuccess: topupDone } = useWaitForTransactionReceipt({
    hash: topupHash,
    chainId: FUJI_CHAIN_ID,
  });
  const [lastTopupUsd, setLastTopupUsd] = useState<number | null>(null);

  useEffect(() => {
    if (unlinkDone) onUnlinked();
  }, [unlinkDone, onUnlinked]);

  useEffect(() => {
    if (topupDone) refetchBalance();
  }, [topupDone, refetchBalance]);

  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mcp);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {}
  }, [mcp]);

  const onUnlink = () => {
    writeUnlink({
      address: REGISTRY_ADDRESS as `0x${string}`,
      abi: MCPRegistryABI,
      functionName: "unregister",
      args: [mcp],
      chainId: FUJI_CHAIN_ID,
    });
  };

  const onTopUp = (usd: number) => {
    setLastTopupUsd(usd);
    writeTopup({
      address: USDC_FUJI,
      abi: USDC_TRANSFER_ABI,
      functionName: "transfer",
      args: [mcp, BigInt(usd) * BigInt(1_000_000)],
      chainId: FUJI_CHAIN_ID,
    });
  };

  const topupBusy = topupPending || topupConfirming;
  const topupErr = topupError?.message;

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
            disabled={unlinkPending || unlinkConfirming}
            className="border border-danger text-danger text-[10px] px-3 py-1 hover:bg-danger hover:text-background disabled:opacity-50 transition-none"
          >
            {unlinkPending
              ? "[ signing… ]"
              : unlinkConfirming
                ? "[ confirming… ]"
                : "[ unlink ]"}
          </button>
        )}
      </div>
      {/* Top-up row · only for the wallet's own profile. Sends a plain
          ERC-20 USDC.transfer from the browser wallet to the MCP address
          on Fuji. Not x402 — the user is funding *their own* MCP. */}
      {isSelf && (
        <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-dim">top up</span>
          {TOPUP_PRESETS_USDC.map((amt) => (
            <button
              key={amt}
              onClick={() => onTopUp(amt)}
              disabled={topupBusy}
              className="border border-border-hi bg-surface-1 text-foreground text-[11px] px-2.5 py-1 tabular-nums hover:border-phosphor hover:text-phosphor transition-none disabled:opacity-40 disabled:cursor-not-allowed"
            >
              +{amt}
            </button>
          ))}
          <span className="text-[10px] text-dim">USDC · from your wallet on Fuji</span>
          {topupBusy && (
            <span className="text-[11px] text-amber tabular-nums">
              {topupPending
                ? `signing +${lastTopupUsd}…`
                : `confirming +${lastTopupUsd}…`}
            </span>
          )}
          {topupDone && !topupBusy && (
            <span className="text-[11px] text-phosphor">sent +{lastTopupUsd} ✓</span>
          )}
        </div>
      )}
      {unlinkError && (
        <div className="text-[11px] text-danger mt-2">
          unlink: {unlinkError.message.slice(0, 150)}
        </div>
      )}
      {topupErr && (
        <div className="text-[11px] text-danger mt-2">
          top-up: {topupErr.slice(0, 150)}
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
