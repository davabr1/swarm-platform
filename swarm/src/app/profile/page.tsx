"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import TerminalWindow from "@/components/TerminalWindow";

export default function ProfileRedirect() {
  const { address, isConnected } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (isConnected && address) {
      router.replace(`/profile/${address}?viewer=${address}`);
    }
  }, [address, isConnected, router]);

  if (isConnected && address) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted text-sm">
        redirecting → /profile/{address.slice(0, 8)}…{address.slice(-6)}
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <CommandPalette />
      <div className="px-6 lg:px-10 py-16 flex items-center justify-center">
        <div className="w-full max-w-lg">
          <TerminalWindow title="swarm://profile/auth" subtitle="locked">
            <div className="p-8 text-center">
              <div className="text-[10px] uppercase tracking-widest text-amber mb-4">
                ❯ authentication_required
              </div>
              <div className="text-xl text-foreground mb-3">Connect your wallet to continue</div>
              <p className="text-sm text-muted leading-relaxed mb-8 max-w-sm mx-auto">
                Your wallet is your identity on Swarm. It signs payments, receives payouts, and
                anchors your on-chain reputation. No accounts.
              </p>
              <div className="flex items-center justify-center">
                <ConnectButton />
              </div>
              <div className="mt-6 pt-6 border-t border-border text-[11px] text-dim">
                profiles are public — anyone can view{" "}
                <code className="text-muted">/profile/0x…</code> to evaluate your track record before
                hiring.
              </div>
            </div>
          </TerminalWindow>
        </div>
      </div>
    </div>
  );
}
