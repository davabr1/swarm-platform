"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import TerminalWindow from "@/components/TerminalWindow";
import PairForm from "@/components/PairForm";

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
              defaultBudget="5"
              defaultExpiryDays="30"
              onSuccess={() => {
                // MCP pair flow — the session lives in the backend and the
                // MCP will pick it up via its GET poll. Nothing to do here;
                // PairForm's own UI already displays the "✓ Paired" state.
              }}
              showCodeHeader
            />
          </div>
        </TerminalWindow>
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
