"use client";

import { useCallback, useEffect, useState } from "react";
import TerminalWindow from "./TerminalWindow";
import { useWalletBalances } from "@/lib/useWalletBalances";
import { fetchBalance, type Balance } from "@/lib/api";

function fmtUsd(microUsd: string | bigint): string {
  const n = typeof microUsd === "bigint" ? microUsd : BigInt(microUsd);
  return (Number(n) / 1_000_000).toFixed(2);
}

// Chain-sourced wallet panel. Under x402 the site doesn't custody a
// balance — the user's wallet IS their balance. Shows the on-chain USDC
// sitting at the profile's address on Fuji plus a faucet link for empty
// wallets. Paired MCP wallets get their own panel (PairedMcpsPanel).
export default function WalletPanel({
  address,
  isSelf,
}: {
  address: string;
  isSelf: boolean;
}) {
  const normalized = (address.startsWith("0x") ? address : `0x${address}`) as `0x${string}`;
  const { usdc } = useWalletBalances(normalized);

  const [balance, setBalance] = useState<Balance | null>(null);
  const [balanceErr, setBalanceErr] = useState("");

  const loadBalance = useCallback(() => {
    fetchBalance(address)
      .then(setBalance)
      .catch(() => setBalanceErr("Could not load balance"));
  }, [address]);

  useEffect(() => {
    loadBalance();
    const iv = setInterval(loadBalance, 15_000);
    return () => clearInterval(iv);
  }, [loadBalance]);

  return (
    <TerminalWindow
      title="swarm://profile/wallet"
      subtitle={isSelf ? "your wallet · Avalanche Fuji" : "wallet · Avalanche Fuji"}
      dots={false}
    >
      <div className="p-5 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-dim mb-2">
            on-chain USDC balance
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl text-phosphor tabular-nums">
              {balance ? fmtUsd(balance.balanceMicroUsd) : "—"}
            </span>
            <span className="text-xs text-dim">USDC</span>
          </div>
          <div className="text-[10px] text-dim mt-2 leading-relaxed">
            wagmi read: {usdc.formatted} USDC{usdc.loading ? " · syncing" : ""}
          </div>
          {balanceErr && <div className="text-[11px] text-danger mt-2">{balanceErr}</div>}
        </div>

        {isSelf && !usdc.loading && usdc.formatted === "0.00" && (
          <div className="border border-amber bg-surface px-3 py-2 text-[11px] leading-relaxed">
            <span className="text-amber">no Fuji USDC detected</span> —{" "}
            <a
              href="https://faucet.circle.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-foreground hover:text-amber-hi"
            >
              grab some from the Circle faucet
            </a>{" "}
            (pick <span className="text-foreground">Avalanche Fuji</span>). Paid agent calls sign an
            EIP-3009 <span className="text-foreground">transferWithAuthorization</span> straight
            from this address — no deposit, no allowance, no gas for you.
          </div>
        )}

        <div className="text-[11px] text-dim leading-relaxed border-t border-border pt-3">
          <span className="text-[10px] uppercase tracking-widest block mb-1">
            how x402 spends this balance
          </span>
          Every paid call returns <code className="text-foreground">402 Payment Required</code>.
          The caller signs an EIP-3009 authorization with this wallet&apos;s key; a facilitator
          settles it on Fuji in ~2s. USDC moves peer-to-peer. You never approve or deposit.
        </div>
      </div>
    </TerminalWindow>
  );
}
