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

// Drain Gang easter egg — triple-click the Claude Code LOGO (not the
// text, only the glyph) within ~900ms to flash a random quip. Every
// line names exactly one of the three artists the user asked for
// (Bladee, Ecco2k, Yung Lean) and pairs them with a specific real
// song/album/motif so the reference actually lands. The toast anchors
// to the logo and has a downward tail so it reads as a speech bubble
// coming out of the glyph.
const DRAIN_QUIPS = [
  "bladee is icedancer-coding this build",
  "yung lean · ginseng strip 2002 · older than this chain",
  "ecco2k · peroxide · bleached the stderr clean",
  "bladee · 333 · your favorite block number",
  "yung lean · kyoto · raining on the testnet",
  "ecco2k · calcium · strong bones, strong typing",
  "bladee · trash star · minted · burned · minted again",
  "yung lean · warlord · owns every validator",
  "ecco2k · blue eyes · watching the mempool",
  "bladee · exeter · signs tx from nowhere",
  "yung lean · hoover · the hat, not the vacuum",
  "ecco2k · 'e' · one letter, one whole album",
  "bladee · reindeer · cross-chain migration",
  "yung lean · agony · when the tx reverts",
  "ecco2k · sugar · the cache is sweet",
  "bladee · be nice 2 me · begs the linter",
  "yung lean · red bottom sky · gas fees on fire",
  "ecco2k · fast drive · rpc latency zero",
  "bladee · cold visions · january-energy commit",
  "yung lean · yoshi city · where the full nodes chill",
  "ecco2k · aaa powerline · 99.999% uptime",
  "bladee · drain story · you're block 333 of it",
  "yung lean · unknown memory · like your last deploy",
  "ecco2k · wiggle · the price chart is doing it",
  "bladee · the fool · who pushes to main on friday",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export default function MCPClients() {
  const [toast, setToast] = useState<string | null>(null);
  // Rolling window of click timestamps on the Claude Code LOGO only. A
  // simple counter would fire on 3 slow clicks too — we want the clicks
  // to actually be fast (<900ms total) for the "fidget trigger" feel.
  const clicks = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onClaudeLogoClick = () => {
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
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {CLIENTS.map((c) => {
            const isClaudeCode = c.name === "Claude Code";
            return (
              <div
                key={c.name}
                className="group flex items-center gap-2 text-muted hover:text-amber transition-none"
                title={`${c.name} · via MCP`}
              >
                {/* Only the logo glyph is the click target. The text
                    label is inert so accidental text clicks don't fire
                    the easter egg. */}
                {isClaudeCode ? (
                  <button
                    type="button"
                    onClick={onClaudeLogoClick}
                    aria-label="Claude Code logo"
                    className="relative shrink-0 cursor-pointer select-none focus:outline-none"
                  >
                    <Image
                      src={c.src}
                      alt=""
                      width={24}
                      height={24}
                      className="w-6 h-6 object-contain"
                      aria-hidden="true"
                      draggable={false}
                    />
                    {toast && (
                      <span
                        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-3 z-20 border border-amber bg-background px-3 py-1.5 text-[11px] font-mono text-amber whitespace-nowrap animate-fade-up"
                        role="status"
                        aria-live="polite"
                      >
                        {toast}
                        {/* Downward tail · two borders of a rotated
                            square become the two visible sides of the
                            triangle pointing at the logo. */}
                        <span
                          aria-hidden="true"
                          className="absolute left-1/2 -translate-x-1/2 top-full -mt-[5px] w-2 h-2 rotate-45 bg-background border-r border-b border-amber"
                        />
                      </span>
                    )}
                  </button>
                ) : (
                  <Image
                    src={c.src}
                    alt=""
                    width={24}
                    height={24}
                    className="w-6 h-6 shrink-0 object-contain"
                    aria-hidden="true"
                  />
                )}
                <span className="text-sm font-semibold tracking-tight">
                  {c.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
