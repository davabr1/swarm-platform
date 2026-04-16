"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function WalletChip() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    // SSR placeholder — matches the connected-state width so layout doesn't shift
    return (
      <div className="h-8 px-3 flex items-center text-xs text-dim border border-border">
        [ …loading ]
      </div>
    );
  }

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openConnectModal, openChainModal, mounted }) => {
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

        return <ConnectedChip address={account.address} displayName={account.displayName} onClickAccount={openAccountModal} />;
      }}
    </ConnectButton.Custom>
  );
}

function ConnectedChip({
  address,
  displayName,
  onClickAccount,
}: {
  address: string;
  displayName: string;
  onClickAccount: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-8 px-3 flex items-center gap-2 text-xs border border-border-hi text-foreground hover:border-amber hover:text-amber transition-none"
      >
        <span className="w-1.5 h-1.5 bg-phosphor" />
        [ {displayName !== address ? displayName : short} ]
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] w-56 border border-border-hi bg-surface z-50 text-xs">
          <div className="px-3 py-2 border-b border-border text-dim">
            <div className="text-[10px] uppercase tracking-widest text-dim mb-1">wallet</div>
            <div className="text-foreground truncate">{short}</div>
          </div>
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-foreground hover:bg-amber hover:text-background"
          >
            → my profile
          </Link>
          <Link
            href="/profile#list-skill"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-foreground hover:bg-amber hover:text-background"
          >
            → list a skill
          </Link>
          <Link
            href="/profile#expert"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-foreground hover:bg-amber hover:text-background"
          >
            → apply as expert
          </Link>
          <button
            onClick={() => {
              setOpen(false);
              onClickAccount();
            }}
            className="block w-full text-left px-3 py-2 text-foreground hover:bg-amber hover:text-background border-t border-border"
          >
            → account · disconnect
          </button>
        </div>
      )}
    </div>
  );
}
