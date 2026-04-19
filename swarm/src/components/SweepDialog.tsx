"use client";

import { useCallback, useEffect, useState } from "react";

// Opens over the profile when a user clicks [ sweep ] on an MCP row. The
// MCP's private key lives only in ~/.swarm-mcp/session.json on the user's
// machine — the browser cannot sign a transfer on its behalf. So the dialog
// surfaces a CLI command, pre-filled with the user's main wallet, that the
// user copy-pastes into their terminal. The CLI reads the local session.json
// and broadcasts the ERC-20 transfer directly, no server in the loop.
export default function SweepDialog({
  mcp,
  destination,
  onClose,
}: {
  mcp: string;
  destination: string;
  onClose: () => void;
}) {
  const command = `npx -y swarm-marketplace-mcp sweep ${destination}`;
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }, [command]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg border border-border-hi bg-surface text-[12px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-3 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-amber">
            ❯ sweep_usdc
          </div>
          <button
            onClick={onClose}
            className="text-dim hover:text-foreground text-[11px]"
          >
            [ close · esc ]
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-foreground leading-relaxed">
            The MCP&rsquo;s private key lives only on your local machine
            (<code className="text-muted">~/.swarm-mcp/session.json</code>).
            The browser can&rsquo;t sign a transfer from the MCP wallet, so the
            sweep runs through the CLI — which reads the local key and
            broadcasts an ERC-20 transfer to your main wallet.
          </div>

          <div className="border border-border bg-surface-1 p-3 space-y-1">
            <div className="text-[10px] uppercase tracking-widest text-dim">
              from
            </div>
            <div className="font-mono break-all text-foreground">{mcp}</div>
            <div className="text-[10px] uppercase tracking-widest text-dim pt-2">
              to (your main wallet)
            </div>
            <div className="font-mono break-all text-phosphor">
              {destination}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
              run this in your terminal
            </div>
            <div className="flex items-stretch gap-2">
              <code className="flex-1 min-w-0 border border-border bg-background px-3 py-2 font-mono text-foreground break-all">
                {command}
              </code>
              <button
                onClick={copy}
                className="border border-amber bg-amber text-background text-[11px] px-4 uppercase tracking-widest hover:bg-amber-hi transition-none shrink-0"
              >
                {copied ? "copied ✓" : "copy"}
              </button>
            </div>
            <div className="text-[10px] text-dim mt-2 leading-relaxed">
              The CLI will print the tx hash and a Snowtrace link when the
              transfer confirms. The MCP wallet keeps working — sweep just
              empties the balance; it doesn&rsquo;t unpair or delete the key.
              To fully unlink, click <span className="text-foreground">[ unlink ]</span> after
              sweeping.
            </div>
          </div>

          <div className="pt-3 border-t border-border text-[10px] text-dim leading-relaxed">
            ⚠ The MCP wallet needs a tiny amount of Fuji AVAX for gas. If the
            CLI errors with &ldquo;insufficient funds for gas&rdquo;, send ~0.01
            AVAX to the MCP address first (
            <a
              href="https://faucet.avax.network/"
              target="_blank"
              rel="noreferrer"
              className="text-amber underline hover:text-amber-hi"
            >
              Avalanche Fuji faucet ↗
            </a>
            ), then retry.
          </div>
        </div>
      </div>
    </div>
  );
}
