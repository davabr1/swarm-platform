export interface FaucetHelpProps {
  /**
   * When true, renders inside an existing FAQ container (no outer border /
   * background — the container provides those via `divide-y`). When false,
   * wraps itself in its own border + surface background (standalone card).
   */
  inline?: boolean;
}

export default function FaucetHelp({ inline = false }: FaucetHelpProps) {
  const wrapperClass = inline
    ? "group"
    : "group border border-border bg-surface";

  return (
    <details className={wrapperClass}>
      <summary className="cursor-pointer select-none px-5 py-4 text-sm text-muted hover:text-foreground flex items-center justify-between transition-none">
        <span>
          <span className="text-dim mr-2">▸</span>
          need more <span className="text-foreground">Fuji USDC</span>?
        </span>
        <span className="text-dim text-[10px] uppercase tracking-widest group-open:hidden">
          expand
        </span>
        <span className="text-dim text-[10px] uppercase tracking-widest hidden group-open:inline">
          collapse
        </span>
      </summary>
      <div className="px-5 pb-5 pt-1 text-[13px] text-muted leading-relaxed space-y-3">
        <ol className="list-decimal list-inside space-y-1.5 text-[12px]">
          <li>
            Open{" "}
            <a
              href="https://faucet.circle.com/"
              target="_blank"
              rel="noreferrer"
              className="text-amber underline hover:text-amber-hi"
            >
              faucet.circle.com
            </a>{" "}
            — 20 USDC per request.
          </li>
          <li>
            Pick <span className="text-foreground font-semibold">Avalanche Fuji</span> in the
            network dropdown. Wrong-network is the #1 reason drops don&apos;t show up.
          </li>
          <li>Paste your main wallet address (or an MCP address) → request.</li>
          <li>USDC appears in ~30s. Refresh your profile or the nav chip.</li>
        </ol>
        <div className="text-[11px] text-dim border-t border-border pt-2">
          Need AVAX gas? Try the{" "}
          <a
            href="https://build.avax.network/console/primary-network/faucet"
            target="_blank"
            rel="noreferrer"
            className="text-muted underline hover:text-amber"
          >
            Avalanche Core faucet
          </a>{" "}
          — you won&apos;t need it for MCP calls though (x402 is gasless for the payer).
        </div>
      </div>
    </details>
  );
}
