"use client";

import { useEffect, useState } from "react";

/**
 * BootSplash · terminal welcome screen.
 *
 * Pixel-block chevron mascot only. No SWARM figlet (ascii-art letters never
 * looked right). Boot log prints line-by-line like real stdout, no bullets,
 * no prompt box, no CSS fades.
 *
 * Shows exactly ONCE per browser session. Uses sessionStorage so:
 *   - first page load / hard refresh / new tab · splash plays
 *   - navigating away and back to landing · splash stays hidden
 *   - full page reload (Cmd-R) · splash plays again
 */

const SESSION_KEY = "swarm:boot-shown";

// Chunky pixelated ❯ chevron. 7 rows of pure █ blocks, 2-wide stroke. The
// only pixel-art element on the splash.
const CHEVRON_MASCOT = [
  "████          ",
  "  ████        ",
  "    ████      ",
  "      ████    ",
  "    ████      ",
  "  ████        ",
  "████          ",
].join("\n");

// Every line is a standalone stdout string. " · " is the separator of
// choice (no em dashes) so it matches the terminal vibe.
const LINES: string[] = [
  "swarm init · bootstrapping the agent marketplace",
  "resolving avalanche fuji · chain 43113",
  "x402 facilitator · ultravioleta dao · reachable",
  "erc-8004 identity + reputation registries loaded",
  "mcp stdio server · 5 tools registered",
  "loaded 29 agents · 8 human experts",
  "ready.",
  "press enter to continue · auto-continues shortly",
];

const LINE_STEP_MS = 140;
const AUTO_DISMISS_MS = 6500;

export default function BootSplash() {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // If we've already shown the splash this browser session, short-circuit
    // so client-side nav back to "/" doesn't replay it.
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") {
        setDismissed(true);
        return;
      }
    } catch {
      // sessionStorage might be blocked in private windows; fine to ignore.
    }
    setMounted(true);
  }, []);

  // When the splash ends (user-dismiss OR auto-dismiss), mark the session
  // so the next client-nav back to "/" does not replay it.
  useEffect(() => {
    if (!dismissed) return;
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // ignore
    }
  }, [dismissed]);

  // Sequential line pop-in. No CSS fade. Each line just appears, like a
  // real terminal flushing stdout.
  useEffect(() => {
    if (!mounted || dismissed) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    LINES.forEach((_, i) => {
      const t = setTimeout(() => setRevealed(i + 1), i * LINE_STEP_MS);
      timers.push(t);
    });
    const auto = setTimeout(() => setDismissed(true), AUTO_DISMISS_MS);
    timers.push(auto);
    return () => timers.forEach(clearTimeout);
  }, [mounted, dismissed]);

  // Enter / Esc / Space / click all dismiss.
  useEffect(() => {
    if (!mounted || dismissed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        setDismissed(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, dismissed]);

  if (!mounted || dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-6"
      onClick={() => setDismissed(true)}
    >
      {/* Skip affordance · top right */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setDismissed(true);
        }}
        className="absolute top-4 right-4 text-[11px] uppercase tracking-widest text-dim hover:text-amber transition-none font-mono"
      >
        [ skip · esc ]
      </button>

      <div
        className="w-full max-w-[1000px] font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Masthead. Just the chevron. No text-shadow, no figlet. */}
        <div className="flex items-center gap-6 mb-10">
          <pre className="text-amber text-[clamp(14px,2vw,24px)] leading-[1] select-none whitespace-pre font-bold">
            {CHEVRON_MASCOT}
          </pre>
        </div>

        {/* Boot log · no bullets, no brackets, bigger text. The ready line
            tints phosphor; the final press-enter line blinks amber using
            the splash-blink animation so it reads as active. */}
        <div className="text-[15px] leading-[2]">
          {LINES.slice(0, revealed).map((text, i) => {
            const isReady = text === "ready.";
            const isPrompt = text.startsWith("press enter");
            let cls = "text-muted";
            if (isReady) cls = "text-phosphor";
            if (isPrompt) cls = "text-amber";
            return (
              <div key={i} className={`whitespace-pre-wrap ${cls}`}>
                {text}
              </div>
            );
          })}
          {/* While lines are still flushing, a bare blinking cursor sits
              on the next row so the layout stays stable. */}
          {revealed < LINES.length && (
            <div className="text-amber">
              <span className="cursor-blink-inline">&nbsp;</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
