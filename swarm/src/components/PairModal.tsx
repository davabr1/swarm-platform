"use client";

import { useEffect, useRef, useState } from "react";

interface PairModalProps {
  open: boolean;
  onCancel: () => void;
}

const PAIR_CMD = "npx -y swarm-marketplace-mcp pair";
const UNPAIR_CMD = "npx -y swarm-marketplace-mcp unpair";

// Pairing happens in the user's terminal, not the browser. The MCP CLI mints
// the pair code, opens this site in a browser window for the wallet signature,
// and polls `/api/pair/claim` with the same code until the browser step
// completes. This modal just shows the command + a quick walkthrough.
export default function PairModal({ open, onCancel }: PairModalProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [flashedPair, setFlashedPair] = useState(false);
  const [flashedUnpair, setFlashedUnpair] = useState(false);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handler = () => onCancel();
    dlg.addEventListener("close", handler);
    return () => dlg.removeEventListener("close", handler);
  }, [onCancel]);

  const copy = async (text: string, setFlash: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setFlash(true);
      setTimeout(() => setFlash(false), 800);
    } catch {
      /* clipboard denied — user can still select-copy */
    }
  };

  return (
    <dialog
      ref={ref}
      className="bg-background text-foreground border border-amber p-0 max-w-xl w-[min(40rem,calc(100vw-2rem))] backdrop:bg-black/70"
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="p-6 space-y-5">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-dim">swarm://authorize</div>
          <h2 className="text-xl text-foreground mt-1 font-semibold">
            pair a new <span className="text-amber">MCP client</span>
          </h2>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            Pairing is initiated from your terminal — not from this page. Run the command below in
            the shell where your MCP client (Claude Code, Cursor, Codex) will run. It will mint a
            pair code, open a browser tab back here, and wait while you sign a one-time off-chain
            message to authorize the session.
          </p>
        </div>

        <div className="border border-border p-4 space-y-4 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
              ❯ step 1 — pair
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="font-mono bg-surface-1 px-3 py-2 border border-border text-foreground select-all">
                {PAIR_CMD}
              </code>
              <button
                onClick={() => copy(PAIR_CMD, setFlashedPair)}
                className={`border border-amber text-amber px-3 py-2 hover:bg-amber hover:text-background transition-none ${
                  flashedPair ? "bg-amber text-background" : ""
                }`}
              >
                {flashedPair ? "[ copied ✓ ]" : "[ copy ]"}
              </button>
            </div>
            <div className="text-dim mt-2 leading-relaxed">
              The CLI prints a URL — it opens automatically in most terminals. You&apos;ll sign one
              message in your wallet, then the terminal will print the config snippet to paste into
              your MCP client.
            </div>
          </div>

          <div className="pt-3 border-t border-border">
            <div className="text-[10px] uppercase tracking-widest text-dim mb-2">
              ❯ step 2 — revoke (later, when you&apos;re done)
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="font-mono bg-surface-1 px-3 py-2 border border-border text-muted select-all">
                {UNPAIR_CMD}
              </code>
              <button
                onClick={() => copy(UNPAIR_CMD, setFlashedUnpair)}
                className={`border border-dim text-dim px-3 py-2 hover:border-muted hover:text-muted transition-none ${
                  flashedUnpair ? "border-amber text-amber" : ""
                }`}
              >
                {flashedUnpair ? "[ copied ✓ ]" : "[ copy ]"}
              </button>
            </div>
            <div className="text-dim mt-2 leading-relaxed">
              Revokes the session for this machine. You can also revoke any session from the list
              on this page — no CLI required.
            </div>
          </div>
        </div>

        <div className="text-[11px] text-dim leading-relaxed">
          once your wallet signs, the session appears in the list below within a few seconds.
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => ref.current?.close()}
            className="border border-border text-muted px-3 py-2 hover:border-amber hover:text-amber text-xs transition-none"
          >
            [ close ]
          </button>
        </div>
      </div>
    </dialog>
  );
}
