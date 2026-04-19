"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import MCPRegistryABI from "@/abis/MCPRegistry.json";
import { FUJI_CHAIN_ID, MCP_REGISTRY_ADDRESS } from "@/lib/fuji";

// Compact inline version of PairedMcpsPanel's unlink flow, for embedding in
// /configure's unpair FAQ. Lets the user finish step 3 (on-chain unregister)
// without leaving the page. The full sweep + pre-unlink warning lives on
// /profile — this is the "I've already cleaned up locally, just unlink" path.
export default function InlineUnlinkMcps() {
  const { address: connected } = useAccount();
  const deployed = MCP_REGISTRY_ADDRESS.length > 0;

  const { data: mcps, refetch } = useReadContract({
    address: deployed ? (MCP_REGISTRY_ADDRESS as `0x${string}`) : undefined,
    abi: MCPRegistryABI,
    functionName: "getMCPs",
    args: connected ? [connected] : undefined,
    chainId: FUJI_CHAIN_ID,
    query: { enabled: deployed && Boolean(connected), refetchInterval: 15_000 },
  }) as { data?: `0x${string}`[]; refetch: () => void };

  if (!connected) {
    return (
      <div className="border border-border bg-surface px-3 py-2.5 text-[12px] text-dim">
        Connect your wallet (top-right) to see MCPs paired to this address.
      </div>
    );
  }

  const list = (mcps ?? []) as `0x${string}`[];

  if (list.length === 0) {
    return (
      <div className="border border-border bg-surface px-3 py-2.5 text-[12px] text-dim">
        No MCPs currently paired to{" "}
        <code className="text-foreground">
          {connected.slice(0, 6)}…{connected.slice(-4)}
        </code>
        . Nothing to unlink.
      </div>
    );
  }

  return (
    <div className="border border-border bg-surface divide-y divide-border">
      {list.map((mcp) => (
        <UnlinkRow key={mcp} mcp={mcp} onUnlinked={refetch} />
      ))}
    </div>
  );
}

function UnlinkRow({
  mcp,
  onUnlinked,
}: {
  mcp: `0x${string}`;
  onUnlinked: () => void;
}) {
  const [armed, setArmed] = useState(false);

  const {
    writeContract,
    data: hash,
    isPending,
    error,
  } = useWriteContract();
  const { isLoading: confirming, isSuccess: done } = useWaitForTransactionReceipt({
    hash,
    chainId: FUJI_CHAIN_ID,
  });

  useEffect(() => {
    if (done) onUnlinked();
  }, [done, onUnlinked]);

  const onUnlink = () => {
    writeContract({
      address: MCP_REGISTRY_ADDRESS as `0x${string}`,
      abi: MCPRegistryABI,
      functionName: "unregister",
      args: [mcp],
      chainId: FUJI_CHAIN_ID,
    });
  };

  const busy = isPending || confirming;

  return (
    <div className="px-3 py-2.5 text-[12px] flex items-center justify-between gap-3">
      <div className="font-mono text-foreground break-all min-w-0 flex-1">
        {mcp}
      </div>
      {done ? (
        <span className="text-phosphor text-[11px] shrink-0">✓ unlinked</span>
      ) : armed ? (
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onUnlink}
            disabled={busy}
            className="border border-danger text-danger text-[10px] px-3 py-1 hover:bg-danger hover:text-background disabled:opacity-50 transition-none"
          >
            {isPending
              ? "[ signing… ]"
              : confirming
                ? "[ confirming… ]"
                : "[ confirm unlink ]"}
          </button>
          <button
            onClick={() => setArmed(false)}
            disabled={busy}
            className="text-dim hover:text-foreground text-[10px] px-2 py-1"
          >
            [ cancel ]
          </button>
        </div>
      ) : (
        <button
          onClick={() => setArmed(true)}
          className="border border-danger text-danger text-[10px] px-3 py-1 hover:bg-danger hover:text-background transition-none shrink-0"
        >
          [ unlink on-chain ]
        </button>
      )}
      {error && (
        <Link
          href="/profile"
          className="text-danger text-[10px] underline shrink-0"
          title={error.message}
        >
          error — see /profile
        </Link>
      )}
    </div>
  );
}
