"use client";

import Image from "next/image";
import { useRef, useState } from "react";

type Client = {
  name: string;
  src: string;
  /** true for logos that are white/transparent — render on a subtle chip so they're visible */
  light?: boolean;
};

const CLIENTS: Client[] = [
  { name: "Claude Code", src: "/logos/claudecode.png" },
  { name: "Claude", src: "/logos/claude.png" },
  { name: "Codex", src: "/logos/chatgpt.png", light: true },
  { name: "Cursor", src: "/logos/codex.png", light: true },
];

// Drain Gang easter egg — triple-click the Claude Code logo within ~900ms
// to flash a random quip. Every line references a specific member of the
// crew by name (Bladee, Ecco2k, Yung Lean, Thaiboy Digital, Whitearmor,
// Gud, Mechatok) or "Drain Gang" itself, usually pointing at a real song
// or album. Same "flash toast" pattern as the TerminalWindow stoplight
// quips — discoverable if you fidget, invisible if you don't.
const DRAIN_QUIPS = [
  "bladee is icedancer-coding this build",
  "ecco2k stared at the diff until it passed",
  "yung lean bought this dip back in 2013",
  "thaiboy digital: legendary member of staff",
  "drain gang's 333 block just confirmed",
  "whitearmor cooked this beat, not claude",
  "gud on the boards, bladee on the keys",
  "mechatok set detected in the cron job",
  "bladee · reindeer · loops while you wait",
  "ecco2k · pxe era · cold start, still icy",
  "yung lean warlord mode: testnet conquered",
  "bladee signed trash star · 1/1 · burned",
  "drain story arc unlocked at block 333",
  "ecco2k's 'e' · one bit, whole aesthetic",
  "the flag is raised (bladee, of course)",
  "yung lean kyoto · 12 validators · overcast",
  "thaiboy tiger just re-orged the chain",
  "bladee whispered 'be nice 2 me' to the db",
  "ecco2k peroxide filter on the stderr",
  "drain gang confirmed · all buy-side",
  "bladee gotham-core terminal achieved",
  "yung lean red bottom sky over this PR",
  "ecco2k calcium.png · 1 pixel, infinite vibe",
  "bladee somewhere in exeter, routing packets",
  "gud just gud'd the whole monorepo",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export default function MCPClients() {
  const [toast, setToast] = useState<string | null>(null);
  // Rolling window of recent click timestamps on the Claude Code logo.
  // We don't use a simple counter because we want the 3 clicks to be
  // fast (<900ms total) — a counter would fire on 3 slow clicks too.
  const clicks = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onClaudeClick = () => {
    const now = Date.now();
    clicks.current = [...clicks.current, now].filter((t) => now - t < 900);
    if (clicks.current.length >= 3) {
      clicks.current = [];
      if (timer.current) clearTimeout(timer.current);
      setToast(pick(DRAIN_QUIPS));
      timer.current = setTimeout(() => setToast(null), 2800);
    }
  };

  return (
    <section className="border-b border-border bg-surface">
      <div className="mx-auto w-full max-w-[1400px] px-6 lg:px-10 py-6 flex flex-col items-center gap-3">
        <span className="text-[11px] uppercase tracking-widest text-dim">
          supported ai platforms
        </span>
        <div className="relative flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {CLIENTS.map((c) => {
            const isClaudeCode = c.name === "Claude Code";
            return (
              <div
                key={c.name}
                className={`group flex items-center gap-2 text-muted hover:text-amber transition-none ${
                  isClaudeCode ? "cursor-pointer select-none" : ""
                }`}
                title={isClaudeCode ? "Claude Code · via MCP (try triple-click)" : `${c.name} · via MCP`}
                onClick={isClaudeCode ? onClaudeClick : undefined}
              >
                <Image
                  src={c.src}
                  alt=""
                  width={24}
                  height={24}
                  className="w-6 h-6 shrink-0 object-contain"
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold tracking-tight">
                  {c.name}
                </span>
              </div>
            );
          })}

          {toast && (
            <div
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-9 z-20 border border-amber bg-background px-3 py-1.5 text-[11px] font-mono text-amber whitespace-nowrap animate-fade-up"
              role="status"
              aria-live="polite"
            >
              {toast}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
