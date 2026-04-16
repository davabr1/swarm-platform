"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import TerminalWindow from "@/components/TerminalWindow";
import { PromptTextarea } from "@/components/Prompt";
import CopyChip from "@/components/CopyChip";
import {
  fetchAgent,
  askAgent,
  rateAgent,
  type Agent,
  type GuidanceBreakdown,
} from "@/lib/api";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

const TYPE_LABEL: Record<Agent["type"], string> = {
  ai: "ai_agent",
  custom_skill: "custom_skill",
  human_expert: "human_expert",
};
const TYPE_COLOR: Record<Agent["type"], string> = {
  ai: "text-info",
  custom_skill: "text-amber",
  human_expert: "text-phosphor",
};

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [input, setInput] = useState("");
  const [log, setLog] = useState<{ kind: string; text: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [rating, setRating] = useState(0);
  const [rated, setRated] = useState(false);
  const ratingInFlight = useRef(false);
  const [breakdown, setBreakdown] = useState<GuidanceBreakdown | null>(null);

  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  useEffect(() => {
    fetchAgent(id).then(setAgent).catch(() => router.push("/"));
  }, [id, router]);

  useEffect(() => {
    if (!log.find((l) => l.kind === "result") || rated) return;
    const onKey = (e: KeyboardEvent) => {
      const k = Number(e.key);
      if (k >= 1 && k <= 5) {
        handleRate(k);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, rated]);

  const askForGuidance = async () => {
    const message = input.trim();
    if (!message || loading) return;
    setLoading(true);
    setRated(false);
    setRating(0);
    setBreakdown(null);
    ratingInFlight.current = false;

    setLog([{ kind: "prompt", text: `❯ ${message}` }]);
    await pause(300);
    setLog((prev) => [
      ...prev,
      { kind: "info", text: `[paying] commission ${agent?.price ?? "$?"} → creator · gemini passthrough · platform margin` },
    ]);
    await pause(500);
    setThinking(true);

    try {
      const result = await askAgent(id, message);
      setThinking(false);
      if (result.status !== "ready" || !result.response) {
        setLog((prev) => [
          ...prev,
          { kind: "error", text: `! guidance ${result.status}: ${result.errorMessage ?? "no response"}` },
        ]);
        return;
      }
      setBreakdown(result.breakdown);
      const total = result.breakdown?.totalUsd ?? "?";
      setLog((prev) => [
        ...prev,
        { kind: "success", text: `[settled] $${total} total charged` },
        { kind: "info", text: `[stream] response from ${agent?.name ?? "agent"}` },
        { kind: "result", text: result.response ?? "" },
      ]);
      const updated = await fetchAgent(id);
      setAgent(updated);
      setInput("");
    } catch (err) {
      setThinking(false);
      setLog((prev) => [...prev, { kind: "error", text: `! error: ${getErrorMessage(err)}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleRate = async (score: number) => {
    if (rated || ratingInFlight.current) return;
    ratingInFlight.current = true;
    setRating(score);
    try {
      const response = await rateAgent(id, score);
      if (agent) {
        setAgent({ ...agent, reputation: response.reputation });
      }
      setRated(true);
      setLog((prev) => [
        ...prev,
        { kind: "success", text: `[rate] ${score}/5 · reputation updated on-chain` },
      ]);
    } catch {
      ratingInFlight.current = false;
    }
  };

  if (!agent) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="px-6 py-16 text-center text-muted text-sm">loading agent…</div>
      </div>
    );
  }

  const isHuman = agent.type === "human_expert";

  return (
    <div className="min-h-screen">
      <Header />
      <CommandPalette />

      <div className="px-6 lg:px-10 py-6">
        <button
          onClick={() => router.push("/")}
          className="text-xs text-muted hover:text-amber mb-4 transition-none"
        >
          ← back to marketplace
        </button>

        <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.6fr)]">
          <TerminalWindow title={`swarm://agent/${agent.id}`} subtitle={TYPE_LABEL[agent.type]}>
            <div className="p-5">
              <div className={`text-[10px] uppercase tracking-widest mb-3 ${TYPE_COLOR[agent.type]}`}>
                ❯ {TYPE_LABEL[agent.type]}
              </div>
              <div className="text-2xl text-foreground mb-1">{agent.name}</div>
              <div className="text-sm text-muted mb-4">{agent.skill}</div>
              <p className="text-sm text-muted leading-relaxed mb-5">{agent.description}</p>

              <div className="space-y-3 text-sm border-t border-border pt-4">
                {[
                  { k: "commission", v: <span className="text-amber tabular-nums">{agent.price}</span> },
                  {
                    k: "rating",
                    v:
                      agent.reputation.count > 0 ? (
                        <span className="text-amber tabular-nums">
                          {agent.reputation.averageScore.toFixed(1)}{" "}
                          <span className="text-dim text-xs">★ ({agent.reputation.count})</span>
                        </span>
                      ) : (
                        <span className="text-dim">no ratings yet</span>
                      ),
                  },
                  { k: "total calls", v: <span className="text-foreground tabular-nums">{agent.totalCalls}</span> },
                  {
                    k: "agent id",
                    v: agent.agentId ? (
                      <span className="text-muted">{agent.agentId}</span>
                    ) : (
                      <span className="text-dim">not registered</span>
                    ),
                  },
                ].map((row) => (
                  <div key={row.k} className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-widest text-dim">{row.k}</span>
                    <span>{row.v}</span>
                  </div>
                ))}

                <div className="border-t border-border pt-3 mt-3">
                  <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
                    how this bills
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    You pay {agent.price} commission (creator gets 100%) + measured Gemini token cost + 10% platform margin. Exact breakdown shows after each call.
                  </p>
                </div>
                <div className="flex items-start justify-between pt-2">
                  <span className="text-[10px] uppercase tracking-widest text-dim">address</span>
                  <CopyChip
                    value={agent.address}
                    display={`${agent.address.slice(0, 6)}…${agent.address.slice(-4)}`}
                    compact
                  />
                </div>
              </div>
            </div>
          </TerminalWindow>

          {isHuman ? (
            <TerminalWindow title="swarm://hire-human" subtitle="escalation">
              <div className="p-6 space-y-5">
                <div className="text-[11px] uppercase tracking-widest text-phosphor">
                  ❯ hire_via_task_board
                </div>
                <p className="text-sm text-muted leading-relaxed">
                  Human experts are hired through the task board. Post a bounty describing what
                  you need. They claim it, submit the result, and get paid instantly in USDC.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/tasks"
                    className="border border-phosphor bg-phosphor px-4 py-2 text-xs font-bold text-background hover:bg-foreground hover:border-foreground transition-none"
                  >
                    [ go to task board ]
                  </Link>
                  <Link
                    href="/profile#expert"
                    className="border border-border-hi px-4 py-2 text-xs text-foreground hover:border-phosphor hover:text-phosphor transition-none"
                  >
                    [ become an expert ]
                  </Link>
                </div>
              </div>
            </TerminalWindow>
          ) : (
            <TerminalWindow title={`swarm://agent/${agent.id}/ask`} subtitle={loading ? "asking…" : "ready"}>
              <div className="p-0">
                <PromptTextarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`ask ${agent.name} for guidance…`}
                  rows={4}
                  className="border-0 border-b border-border"
                />
                <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-[11px] text-dim uppercase tracking-widest">
                    commission <span className="text-amber">{agent.price}</span>
                    <span className="text-muted"> + gemini + 10% margin</span>
                    {" · settles via x402"}
                  </span>
                  <button
                    onClick={askForGuidance}
                    disabled={loading || !input.trim()}
                    className="border border-amber bg-amber px-4 py-1.5 text-xs font-bold text-background hover:bg-amber-hi transition-none disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? "asking…" : `[ ask · pay ${agent.price}+ ]`}
                  </button>
                </div>

                {breakdown && (
                  <div className="border-b border-border bg-surface-1 px-4 py-3 text-xs animate-fade-up">
                    <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
                      ❯ payment_breakdown
                    </div>
                    <div className="grid grid-cols-4 gap-2 tabular-nums">
                      <div>
                        <div className="text-dim text-[10px] uppercase tracking-widest">commission</div>
                        <div className="text-phosphor">${breakdown.commissionUsd}</div>
                        <div className="text-dim text-[10px]">→ creator</div>
                      </div>
                      <div>
                        <div className="text-dim text-[10px] uppercase tracking-widest">gemini</div>
                        <div className="text-muted">${breakdown.geminiCostUsd}</div>
                        <div className="text-dim text-[10px]">passthrough</div>
                      </div>
                      <div>
                        <div className="text-dim text-[10px] uppercase tracking-widest">platform</div>
                        <div className="text-muted">${breakdown.platformFeeUsd}</div>
                        <div className="text-dim text-[10px]">10% margin</div>
                      </div>
                      <div className="text-right">
                        <div className="text-dim text-[10px] uppercase tracking-widest">total</div>
                        <div className="text-amber text-sm font-bold">${breakdown.totalUsd}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="min-h-[220px] bg-background">
                  {log.length === 0 ? (
                    <div className="p-6 text-dim text-sm">
                      guidance streams here after you ask the agent.
                    </div>
                  ) : (
                    <div className="p-4 space-y-2 text-sm">
                      {log.map((line, i) => (
                        <div
                          key={i}
                          className={
                            line.kind === "prompt"
                              ? "text-amber"
                              : line.kind === "info"
                              ? "text-muted"
                              : line.kind === "error"
                              ? "text-danger"
                              : line.kind === "success"
                              ? "text-phosphor"
                              : "text-foreground"
                          }
                        >
                          {line.kind === "result" ? (
                            <pre className="whitespace-pre-wrap border-l border-border pl-3 leading-relaxed">{line.text}</pre>
                          ) : (
                            <span className="font-mono text-xs">{line.text}</span>
                          )}
                        </div>
                      ))}

                      {thinking && (
                        <div className="flex items-center gap-2 text-muted text-xs font-mono animate-pulse">
                          <span className="text-amber">[thinking]</span>
                          <span>{agent.name} is working</span>
                          <span className="inline-flex gap-0.5">
                            <span className="w-1 h-1 bg-amber rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-1 h-1 bg-amber rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-1 h-1 bg-amber rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                          </span>
                        </div>
                      )}

                      {log.find((l) => l.kind === "result") && !rated && !loading && (
                        <div className="pt-3 mt-3 border-t border-border flex items-center gap-3">
                          <span className="text-[11px] uppercase tracking-widest text-dim">
                            [rate] press 1–5 or click
                          </span>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <button
                                key={s}
                                onClick={() => handleRate(s)}
                                className={`w-7 h-7 border text-sm transition-none ${
                                  s <= rating
                                    ? "border-amber bg-amber text-background"
                                    : "border-border text-muted hover:border-amber hover:text-amber"
                                }`}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </TerminalWindow>
          )}
        </div>
      </div>
    </div>
  );
}
