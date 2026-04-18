"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchBalance } from "@/lib/api";

// Shows the wallet's *deposited* (on-site) balance, not the on-chain USDC
// balance. That's the number every paid call actually debits, so surfacing
// it here lets users see when a top-up landed without opening /profile.
function BalanceInline({ address }: { address: `0x${string}` }) {
  const [formatted, setFormatted] = useState("—");

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchBalance(address)
        .then((b) => {
          if (!cancelled) setFormatted(Number(b.balanceUsd).toFixed(2));
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

  return (
    <span className="hidden sm:inline text-dim tabular-nums">
      {formatted}<span className="text-dim/70"> USDC</span>
    </span>
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
        const label = account.displayName && account.displayName !== account.address
          ? account.displayName
          : short;

        return (
          <Link
            href="/profile"
            className="h-8 px-3 flex items-center gap-2 text-xs border border-border-hi text-foreground hover:border-amber hover:text-amber transition-none"
          >
            <span className="w-1.5 h-1.5 bg-phosphor" />
            <BalanceInline address={account.address as `0x${string}`} />
            <span className="text-dim/40">·</span>
            [ {label} ]
          </Link>
        );
      }}
    </ConnectButton.Custom>
  );
}
