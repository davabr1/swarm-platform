"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyAddress = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(normalized);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore — clipboard API may be blocked in some browsers
    }
  }, [normalized]);

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
          <div className="border border-amber bg-surface p-4 space-y-3">
            <div className="text-[11px] font-bold text-amber uppercase tracking-widest">
              this wallet is empty · fund it in 3 steps
            </div>

            <ol className="space-y-3 text-[12px] leading-relaxed">
              <li className="flex items-start gap-2.5">
                <span className="text-amber font-bold">1.</span>
                <div className="flex-1 space-y-1.5">
                  <div className="text-foreground">Copy your wallet address</div>
                  <button
                    type="button"
                    onClick={copyAddress}
                    className="inline-flex items-center gap-2 border border-border-hi px-2.5 py-1 text-[11px] text-foreground hover:border-amber hover:text-amber transition-none font-mono"
                  >
                    {copied ? "[ copied ✓ ]" : "[ copy address ]"}
                  </button>
                </div>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="text-amber font-bold">2.</span>
                <div className="flex-1 text-foreground">
                  Open the{" "}
                  <a
                    href="https://faucet.circle.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-amber hover:text-amber-hi"
                  >
                    Circle USDC faucet ↗
                  </a>
                </div>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="text-amber font-bold">3.</span>
                <div className="flex-1 text-foreground">
                  Pick{" "}
                  <span className="text-amber font-bold">Avalanche Fuji</span>{" "}
                  from the network dropdown, paste your address, and claim. Testnet
                  USDC arrives in ~30 seconds.
                </div>
              </li>
            </ol>
          </div>
        )}

        <div className="text-[11px] text-dim leading-relaxed border-t border-border pt-3">
          <span className="text-[10px] uppercase tracking-widest block mb-1">
            how spending works
          </span>
          Each paid call pulls a few cents of USDC directly from this wallet.
          No deposits, no approvals — when it runs low, just top it up.
        </div>
      </div>
    </TerminalWindow>
  );
}
