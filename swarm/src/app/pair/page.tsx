"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import TerminalWindow from "@/components/TerminalWindow";
import PairForm from "@/components/PairForm";
import PairOnboarding from "@/components/PairOnboarding";

export default function PairPage() {
  return (
    <Suspense fallback={<Shell><div className="text-sm text-muted">loading…</div></Shell>}>
      <PairInner />
    </Suspense>
  );
}

function PairInner() {
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const validCode = /^pair_[A-Za-z0-9_-]{16,64}$/.test(code);
  const [pairedAddress, setPairedAddress] = useState<string | null>(null);

  if (!validCode) {
    return (
      <Shell>
        <div className="text-sm text-danger">Invalid or missing pair code in URL.</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="w-full max-w-xl">
        <TerminalWindow title="swarm://pair" subtitle="one-time MCP authorization">
          <div className="p-6">
            <PairForm
              code={code}
              defaultExpiryDays="30"
              onSuccess={(r) => setPairedAddress(r.address.toLowerCase())}
              showCodeHeader
            />
          </div>
        </TerminalWindow>
        {pairedAddress && <PairOnboarding address={pairedAddress} />}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Header />
      <CommandPalette />
      <div className="px-6 lg:px-10 py-12 flex items-start justify-center">{children}</div>
    </div>
  );
}
