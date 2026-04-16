"use client";

import { useState } from "react";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import TerminalWindow from "@/components/TerminalWindow";
import { PromptTextarea } from "@/components/Prompt";
import { orchestrate, type OrchestrateResult } from "@/lib/api";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

// Keep each example a single compact line so the rotator fits without scrolling.
const EXAMPLES = [
  "Trace 0x742d35…f44e's last 50 txs. Flag mixer or sanctioned hops, escalate if the path is non-trivial.",
  "Stress-test tokenomics: 1B supply, 20% team (1y cliff, 4y vest), 10% emissions/yr. Surface capture risks.",
  "Audit this upgraded proxy for storage collisions + delegatecall traps. Escalate to Proofline if material.",
  "Review this L2 bridge: 4-of-7 validator set, new. Flag replay windows. Human reviewer if zk proof's weak.",
  "Due diligence on this stablecoin: check peg mechanism, attestations, any recent depegs. Flag counterparty risk.",
  "Simulate this governance proposal: 2% supply + 12-month vest + veto. Model whale capture and voter apathy.",
];

const VISIBLE_EXAMPLES = 2;

export default function OrchestratePage() {
  const [task, setTask] = useState("");
  const [result, setResult] = useState<OrchestrateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exampleStart, setExampleStart] = useState(0);

  const visibleExamples = Array.from({ length: VISIBLE_EXAMPLES }, (_, i) => ({
    idx: (exampleStart + i) % EXAMPLES.length,
    text: EXAMPLES[(exampleStart + i) % EXAMPLES.length]!,
  }));

  const shuffle = () =>
    setExampleStart((s) => (s + VISIBLE_EXAMPLES) % EXAMPLES.length);

  const run = async () => {
    if (!task.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const r = await orchestrate(task);
      setResult(r);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    // Lock the whole page to one viewport so the statusbar stays pinned and
    // there's never a scroll on the conductor itself — only the trace pane
    // scrolls internally when a result is long. 1.75rem = statusbar height.
    <div className="h-[calc(100dvh-1.75rem)] flex flex-col overflow-hidden">
      <Header />
      <CommandPalette />

      <div className="flex-1 min-h-0 flex flex-col px-6 lg:px-10 py-5 overflow-hidden">
        {/* Compact title row — tight so it doesn't eat the work area */}
        <div className="mb-4 flex items-end justify-between flex-wrap gap-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-dim">
              swarm://conductor
            </div>
            <h1 className="text-xl text-foreground mt-1">conductor</h1>
            <p className="text-xs text-muted mt-1 max-w-2xl leading-relaxed">
              Breaks a task into subtasks, picks a specialist for each, hires them via
              x402, escalates to a human if needed. Exposed over MCP as{" "}
              <code className="text-amber">swarm_orchestrate</code>.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-dim">
            <span>decompose</span>
            <span>→</span>
            <span>select</span>
            <span>→</span>
            <span>call</span>
            <span>→</span>
            <span>assemble</span>
          </div>
        </div>

        {/* Main work area — fills the rest of the viewport */}
        <div className="flex-1 min-h-0 grid gap-5 lg:grid-cols-[1fr_1.25fr]">
          {/* Left — input pane + rotating examples */}
          <div className="flex flex-col min-h-0 gap-3">
            <TerminalWindow
              title="swarm://input"
              subtitle="task"
              className="flex-1 min-h-0 flex flex-col"
              bodyClassName="flex-1 min-h-0 flex flex-col"
            >
              <PromptTextarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="describe a complex task that needs multiple agents…"
                className="border-0 flex-1 min-h-0 bg-surface!"
              />
              <div className="px-4 py-3 border-t border-border flex items-center justify-between flex-shrink-0 bg-surface">
                <span className="text-[11px] text-dim uppercase tracking-widest">
                  {task.length} chars · est.{" "}
                  {Math.max(1, Math.ceil(task.length / 120))} subtasks
                </span>
                <button
                  onClick={run}
                  disabled={loading || !task.trim()}
                  className="border border-border-hi px-4 py-1.5 text-xs text-foreground hover:border-amber hover:text-amber transition-none disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? "conducting…" : "[ run conductor ]"}
                </button>
              </div>
            </TerminalWindow>

            {/* Examples rotator — fixed footprint, reshuffles on click */}
            <div className="flex-shrink-0 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-dim uppercase tracking-widest">
                  try an example →
                </span>
                <button
                  onClick={shuffle}
                  className="text-[11px] text-dim uppercase tracking-widest hover:text-amber transition-none"
                >
                  [ shuffle · {exampleStart + 1}/{EXAMPLES.length} ]
                </button>
              </div>
              {visibleExamples.map(({ idx, text }) => (
                <button
                  key={idx}
                  onClick={() => setTask(text)}
                  className="w-full text-left text-xs border border-border bg-surface px-3 py-2 text-muted hover:border-amber hover:text-foreground hover:bg-surface-1 transition-none leading-relaxed line-clamp-2"
                >
                  <span className="text-dim mr-2">
                    [{String(idx + 1).padStart(2, "0")}]
                  </span>
                  {text}
                </button>
              ))}
            </div>
          </div>

          {/* Right · trace pane. Internal-only scroll for long outputs. */}
          <TerminalWindow
            title="swarm://conductor/trace"
            subtitle={loading ? "running…" : result ? "complete" : "idle"}
            className="flex flex-col min-h-0"
            bodyClassName="flex-1 min-h-0 flex flex-col"
          >
            <div className="flex-1 min-h-0 bg-background overflow-auto">
              {error && (
                <div className="p-6 text-danger text-sm font-mono">
                  ! error: {error}
                </div>
              )}
              {!result && !error && !loading && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6">
                  <div className="text-dim text-sm mb-2">nothing to run yet.</div>
                  <div className="text-[11px] text-dim uppercase tracking-widest">
                    output streams here.
                  </div>
                </div>
              )}
              {loading && (
                <div className="p-6 space-y-2 text-sm">
                  <div className="text-amber">❯ breaking down task…</div>
                  <div className="text-muted">
                    &nbsp;&nbsp;shopping marketplace by reputation
                  </div>
                  <div className="text-muted">
                    &nbsp;&nbsp;comparing candidates…
                    <span className="cursor-blink" />
                  </div>
                </div>
              )}
              {result && (
                <div>
                  {/* Summary header */}
                  <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-surface-1 sticky top-0 z-10">
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-amber">[ summary ]</span>
                      <span className="text-muted">
                        {result.subtasks.length} subtasks ·{" "}
                        {result.subtasks.filter((s) => s.type === "agent").length} agents ·{" "}
                        {result.subtasks.filter((s) => s.type === "human").length} humans
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-dim mr-1">total</span>
                      <span className="text-amber tabular-nums font-bold">
                        ${result.totalCost}
                      </span>
                    </div>
                  </div>

                  <div className="divide-y divide-border">
                    {result.subtasks.map((sub, i) => (
                      <div
                        key={i}
                        className="p-4 animate-fade-up"
                        style={{ animationDelay: `${i * 80}ms` }}
                      >
                        <div className="flex items-center justify-between mb-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-dim">
                              [{String(i + 1).padStart(2, "0")}]
                            </span>
                            <span
                              className={
                                sub.type === "human" ? "text-phosphor" : "text-amber"
                              }
                            >
                              {sub.agent}
                            </span>
                            <span className="text-dim">·</span>
                            <span className="text-muted">{sub.type}</span>
                          </div>
                          <span className="text-amber tabular-nums">{sub.price}</span>
                        </div>
                        <div className="text-[11px] text-dim mb-2">
                          <span className="text-amber mr-1">&gt;</span>
                          {sub.subtask}
                        </div>
                        <pre className="text-sm text-foreground whitespace-pre-wrap leading-relaxed border-l border-border pl-3">
                          {sub.result}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TerminalWindow>
        </div>
      </div>
    </div>
  );
}
