"use client";

import { useEffect, useState } from "react";

/**
 * BootSplash · terminal welcome screen.
 *
 * Renders as the ENTIRE page on first load, not as an overlay. The parent
 * page is expected to early-return just this component while `dismissed`
 * is false, then render the real landing content afterwards.
 *
 * Shows exactly once per browser session. Uses sessionStorage so:
 *   - first page load / hard refresh / new tab · splash plays
 *   - client-side nav back to "/" · splash stays dismissed
 *   - full page reload (Cmd-R) · splash plays again
 */

const SESSION_KEY = "swarm:boot-shown";

// Chunky pixel-art ❯ chevron mascot · 6 rows to match the SWARM figlet
// height exactly.
const CHEVRON_MASCOT = [
  "████          ",
  "  ████        ",
  "    ████      ",
  "    ████      ",
  "  ████        ",
  "████          ",
].join("\n");

// SWARM figlet · "ANSI Shadow" style. Filled block letters with box-drawing
// connectors so the word reads as a real pixel logo. Rendered in system
// Courier New (forced via inline style on the pre) so the █ blocks and
// ╗╚╝║═ corners sit flush · this is the state the user confirmed looks
// good.
const SWARM_ART = [
  "███████╗██╗    ██╗ █████╗ ██████╗ ███╗   ███╗",
  "██╔════╝██║    ██║██╔══██╗██╔══██╗████╗ ████║",
  "███████╗██║ █╗ ██║███████║██████╔╝██╔████╔██║",
  "╚════██║██║███╗██║██╔══██║██╔══██╗██║╚██╔╝██║",
  "███████║╚███╔███╔╝██║  ██║██║  ██║██║ ╚═╝ ██║",
  "╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝",
].join("\n");

// Boot log · the splash scrolls these five-at-a-time, so the LAST FIVE
// lines are the ones parked on screen when "ready" arrives. Those five
// are deliberately all Avalanche-ecosystem checkpoints so the frozen
// frame reads as "Swarm is live on Avalanche" to anyone glancing.
// Earlier lines cover the generic boot stuff (MCP tools, agent registry,
// Gemini handshake) and scroll off before the user sees them freeze.
const LINES: string[] = [
  // scroll-off · generic swarm boot
  "swarm init · bootstrapping the agent marketplace",
  "loading kernel modules · stdio, sse, http",
  "connecting to gemini · warming up",
  "mounting mcp stdio transport",
  "registering tool · swarm_list_agents",
  "registering tool · swarm_call_agent",
  "registering tool · swarm_rate_agent",
  "registering tool · swarm_post_human_task",
  "registering tool · swarm_orchestrate",
  "streaming agent registry · 29 agents loaded",
  "streaming expert pool · 8 humans loaded",
  "priming reputation cache · 1,248 signals",
  "verifying ecosystem attestations · ok",
  "preflight complete · powering on avalanche stack",
  // final six · avalanche sponsor checkpoints, visible at rest
  "handshake · avalanche c-chain validator set",
  "avalanche fuji · chain 43113 · public rpc online",
  "x402 facilitator · ultravioleta dao · synced",
  "erc-8004 identity + reputation registries · live on fuji",
  "usdc payment channel · open on fuji testnet",
  "ready · press enter to continue",
];

const LINE_STEP_MS = 95;
const AUTO_DISMISS_MS = 8500;
// Only this many boot lines are on screen at once · older ones scroll
// off as newer ones flush in, so the splash never walls the viewport.
// Six rows matches what the user sees during the scrolling phase
// (5 revealed + 1 cursor), so the resting state keeps the same height.
const VISIBLE_LINES = 6;

export interface BootSplashProps {
  /** Called when the splash should finish. Parent flips its own state. */
  onDismiss: () => void;
}

export default function BootSplash({ onDismiss }: BootSplashProps) {
  const [revealed, setRevealed] = useState(0);

  // Sequential line pop-in · every line appears like a terminal flushing
  // stdout. No CSS fade.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    LINES.forEach((_, i) => {
      const t = setTimeout(() => setRevealed(i + 1), i * LINE_STEP_MS);
      timers.push(t);
    });
    const auto = setTimeout(onDismiss, AUTO_DISMISS_MS);
    timers.push(auto);
    return () => timers.forEach(clearTimeout);
  }, [onDismiss]);

  // Enter / Esc / Space / click anywhere all dismiss.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-6 cursor-pointer"
      onClick={onDismiss}
      role="button"
      tabIndex={0}
    >
      <div
        className="w-full max-w-[960px] font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Masthead · pixel ❯ chevron mascot paired with the SWARM figlet.
            Forces system Courier New on each pre so the box-drawing chars
            (╗╚╝║═) sit flush against the █ blocks. JetBrains Mono renders
            them with a 1-px gap and shatters the logo. leading 1.2 is
            what Gemini's reference HTML uses. */}
        <div className="flex items-center gap-6 mb-10">
          <pre
            className="text-amber text-[clamp(11px,1.4vw,18px)] leading-[1.2] select-none whitespace-pre font-bold"
            style={{ fontFamily: "'Courier New', Courier, monospace" }}
          >
            {CHEVRON_MASCOT}
          </pre>
          <pre
            className="text-foreground text-[clamp(11px,1.4vw,18px)] leading-[1.2] select-none whitespace-pre font-bold"
            style={{ fontFamily: "'Courier New', Courier, monospace" }}
          >
            {SWARM_ART}
          </pre>
        </div>

        {/* Boot log · fixed height of exactly VISIBLE_LINES rows. Older
            lines scroll off as newer ones appear, the block itself never
            resizes, so the SWARM figlet above stays put regardless of
            reveal state. Using justify-end so the latest line always
            sits at the bottom of the frame while earlier lines bubble
            up. The blinking cursor counts toward the visible total, so
            we only render VISIBLE_LINES-1 revealed lines while the log
            is still flushing. */}
        {(() => {
          const typing = revealed < LINES.length;
          const cap = typing ? VISIBLE_LINES - 1 : VISIBLE_LINES;
          const start = Math.max(0, revealed - cap);
          const shown = LINES.slice(start, revealed);
          return (
            <div
              className="text-[14px] leading-[1.85] overflow-hidden flex flex-col justify-end"
              style={{ height: `${VISIBLE_LINES * 1.85}em` }}
            >
              {shown.map((text, i) => {
                const absIdx = start + i;
                const isFinal = absIdx === LINES.length - 1;
                const cls = isFinal ? "text-phosphor" : "text-muted";
                return (
                  <div key={absIdx} className={`whitespace-pre-wrap ${cls}`}>
                    {text}
                  </div>
                );
              })}
              {typing && (
                <div className="text-amber">
                  <span className="cursor-blink-inline">&nbsp;</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/** Read/write helpers so the landing page can decide whether to mount
 *  the splash at all, without duplicating the session-key constant. */
export function shouldShowBootSplash(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(SESSION_KEY) !== "1";
  } catch {
    return true;
  }
}

export function markBootSplashShown(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // ignore
  }
}
