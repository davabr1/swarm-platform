"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import TerminalWindow from "@/components/TerminalWindow";
import { PromptTextarea } from "@/components/Prompt";
import CopyChip from "@/components/CopyChip";
import { fetchAgent, callAgent, quoteAgent, rateAgent, type Agent, type AgentQuote } from "@/lib/api";

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
  const [rating, setRating] = useState(0);
  const [rated, setRated] = useState(false);
  const [quote, setQuote] = useState<AgentQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string>("");

  useEffect(() => {
    fetchAgent(id).then(setAgent).catch(() => router.push("/"));
  }, [id, router]);

  // Keyboard: 1-5 to rate after response
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

  const resetQuote = () => {
    setQuote(null);
    setQuoteError("");
  };

  const getQuote = async () => {
    if (!input.trim() || quoting) return;
    resetQuote();
    setQuoting(true);
    setLog([{ kind: "prompt", text: `❯ ${input}` }, { kind: "info", text: `[quote] asking ${agent?.name} to price this task…` }]);
    try {
      const q = await quoteAgent(id, input);
      setQuote(q);
      setLog((prev) => [
        ...prev,
        { kind: "info", text: `[quote] scope: ${q.scope}` },
        { kind: "info", text: `[quote] ${q.basePrice} base + ${q.overage} overage = ${q.totalPrice}` },
      ]);
    } catch (err) {
      setQuoteError(getErrorMessage(err));
      setLog((prev) => [...prev, { kind: "error", text: `! quote error: ${getErrorMessage(err)}` }]);
    } finally {
      setQuoting(false);
    }
  };

  const approveAndCall = async (quotedPrice?: string) => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setRated(false);
    setRating(0);
    const priceToShow = quotedPrice ?? quote?.totalPrice ?? agent?.price ?? "";
    setLog((prev) => [
      ...prev,
      { kind: "success", text: `[approved] ${priceToShow} authorized` },
      { kind: "info", text: `[paying] ${priceToShow} → ${agent?.address.slice(0, 8)}…` },
    ]);
    try {
      const response = await callAgent(id, input, quotedPrice ?? quote?.totalPrice);
      setLog((prev) => [
        ...prev,
        { kind: "info", text: `[stream] response from ${response.agent}` },
        { kind: "result", text: response.result },
      ]);
      const updated = await fetchAgent(id);
      setAgent(updated);
      resetQuote();
    } catch (err) {
      setLog((prev) => [...prev, { kind: "error", text: `! error: ${getErrorMessage(err)}` }]);
    } finally {
      setLoading(false);
    }
  };

  // For flat-priced agents, skip the quote ceremony entirely.
  const callFlat = () => approveAndCall(agent?.price);

  // Reset quote when user edits the input after quoting.
  useEffect(() => {
    if (quote) resetQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const handleRate = async (score: number) => {
    if (rated) return;
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
      // silent
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
          {/* Left — metadata pane */}
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
                  { k: "price", v: <span className="text-amber tabular-nums">{agent.price}</span> },
                  {
                    k: "pricing model",
                    v: (
                      <span className="text-foreground text-xs">
                        {(agent.pricingModel ?? "flat").replace("_", " ")}
                      </span>
                    ),
                  },
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

                {agent.pricingNote && (
                  <div className="border-t border-border pt-3 mt-3">
                    <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
                      how this bills
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed">{agent.pricingNote}</p>
                  </div>
                )}
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

          {/* Right — try it pane */}
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
            <TerminalWindow title={`swarm://agent/${agent.id}/try`} subtitle={loading ? "running…" : "ready"}>
              <div className="p-0">
                <PromptTextarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`enter a request for ${agent.name}…`}
                  rows={4}
                  className="border-0 border-b border-border"
                />
                <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-[11px] text-dim uppercase tracking-widest">
                    base · <span className="text-amber">{agent.price}</span>
                    {agent.pricingModel && agent.pricingModel !== "flat" && (
                      <> · <span className="text-muted">{agent.pricingModel.replace("_", " ")}</span></>
                    )}
                    {" · settles via x402"}
                  </span>
                  <div className="flex items-center gap-2">
                    {/* Flat agents: single-click call. Everyone else goes through quote. */}
                    {agent.pricingModel === "flat" ? (
                      <button
                        onClick={callFlat}
                        disabled={loading || !input.trim()}
                        className="border border-amber bg-amber px-4 py-1.5 text-xs font-bold text-background hover:bg-amber-hi transition-none disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {loading ? "processing…" : `[ call · ${agent.price} ]`}
                      </button>
                    ) : !quote ? (
                      <button
                        onClick={getQuote}
                        disabled={quoting || !input.trim()}
                        className="border border-amber px-4 py-1.5 text-xs font-bold text-amber hover:bg-amber hover:text-background transition-none disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {quoting ? "getting quote…" : `[ get quote ]`}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => resetQuote()}
                          disabled={loading}
                          className="border border-border-hi px-3 py-1.5 text-xs text-muted hover:text-foreground transition-none disabled:opacity-40"
                        >
                          [ revise ]
                        </button>
                        <button
                          onClick={() => approveAndCall()}
                          disabled={loading}
                          className="border border-phosphor bg-phosphor px-4 py-1.5 text-xs font-bold text-background hover:bg-foreground hover:border-foreground transition-none disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {loading ? "processing…" : `[ approve · pay ${quote.totalPrice} ]`}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Quote panel — shown after a successful quote, hidden once approved */}
                {quote && !loading && (
                  <div className="border-b border-border bg-surface-1 px-4 py-3 text-xs space-y-2 animate-fade-up">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-amber">
                      ❯ quote_received
                      <span className="text-dim">·</span>
                      <span className="text-muted">tier {quote.tier}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto] items-start">
                      <div>
                        <div className="text-foreground leading-relaxed">{quote.scope}</div>
                        <div className="text-muted leading-relaxed mt-1 text-[11px]">{quote.rationale}</div>
                      </div>
                      <div className="text-right tabular-nums">
                        <div className="text-dim text-[10px] uppercase tracking-widest">base</div>
                        <div className="text-muted">{quote.basePrice}</div>
                        <div className="text-dim text-[10px] uppercase tracking-widest mt-1">overage</div>
                        <div className={quote.overage === "$0.00" ? "text-dim" : "text-amber"}>{quote.overage}</div>
                        <div className="text-dim text-[10px] uppercase tracking-widest mt-1">total</div>
                        <div className="text-phosphor text-sm font-bold">{quote.totalPrice}</div>
                      </div>
                    </div>
                  </div>
                )}
                {quoteError && !quote && (
                  <div className="border-b border-border bg-danger/5 text-danger px-4 py-2 text-xs">
                    {quoteError}
                  </div>
                )}

                <div className="min-h-[220px] bg-background">
                  {log.length === 0 ? (
                    <div className="p-6 text-dim text-sm">
                      output streams here after you call the agent.
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

                      {log.find((l) => l.kind === "result") && !rated && (
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
