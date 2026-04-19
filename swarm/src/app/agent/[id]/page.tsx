"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import TerminalWindow from "@/components/TerminalWindow";
import { PromptTextarea } from "@/components/Prompt";
import CopyChip from "@/components/CopyChip";
import SubmittingLabel from "@/components/SubmittingLabel";
import {
  fetchAgent,
  askAgent,
  callImage,
  rateAgent,
  rateAgentMessage,
  PaymentRequiredError,
  type Agent,
  type GuidanceBreakdown,
} from "@/lib/api";
import { getCategory, CATEGORY_LABEL, CATEGORY_TEXT } from "@/lib/agentCategory";
import { useAccount, useSignMessage } from "wagmi";
import { useX402Fetch } from "@/lib/useX402Fetch";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { fetch: x402Fetch, hooksRef: x402HooksRef } = useX402Fetch();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [input, setInput] = useState("");
  const [log, setLog] = useState<{ kind: string; text: string; imageId?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [rating, setRating] = useState(0);
  const [rated, setRated] = useState(false);
  const ratingInFlight = useRef(false);
  const [breakdown, setBreakdown] = useState<GuidanceBreakdown | null>(null);
  // Follow-up envelope state. Mirrors the MCP's `swarm_follow_up` loop:
  // if the specialist replies with `replyType === "question"`, we stash the
  // conversationId so the user's next send threads onto the same chain
  // (same 5-turn cap as the route). Cleared on a fresh ask or once the
  // specialist gives a final `response`.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turn, setTurn] = useState(0);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const TURN_CAP = 5;

  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  useEffect(() => {
    fetchAgent(id).then(setAgent).catch(() => router.push("/"));
  }, [id, router]);

  useEffect(() => {
    if (!log.find((l) => l.kind === "result" || l.kind === "image") || rated) return;
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

  const isImage = agent?.skill?.startsWith("Image") ?? false;

  const askForGuidance = async () => {
    const message = input.trim();
    if (!message || loading) return;

    if (!isConnected || !address || !x402Fetch) {
      setLog((prev) => [
        ...prev,
        { kind: "error", text: "! connect a wallet first — agents charge USDC per call" },
      ]);
      return;
    }

    setLoading(true);
    ratingInFlight.current = false;

    // If the specialist's last reply was a clarifying question, we thread
    // onto the same conversation instead of starting a new one. Otherwise
    // we wipe the slate (new question = new rating, new breakdown, new log).
    const isFollowUp = awaitingReply && conversationId !== null;
    if (!isFollowUp) {
      setRated(false);
      setRating(0);
      setBreakdown(null);
      setLog([{ kind: "prompt", text: `❯ ${message}` }]);
    } else {
      setLog((prev) => [...prev, { kind: "prompt", text: `❯ ${message}` }]);
    }
    await pause(200);
    setLog((prev) => [
      ...prev,
      {
        kind: "info",
        text: agent && !agent.userCreated
          ? `[pricing] no commission · AI cost · 5% platform margin${isFollowUp ? " · follow-up turn" : ""}`
          : `[pricing] commission ${agent?.price ?? "$?"} → creator · AI cost · platform margin${isFollowUp ? " · follow-up turn" : ""}`,
      },
    ]);
    await pause(200);
    setLog((prev) => [
      ...prev,
      {
        kind: "info",
        text: "[request] calling agent endpoint · expecting 402 ceiling quote",
      },
    ]);

    // Hook into the x402 handshake so the log mirrors reality: we only show
    // "signing" when the wallet actually prompts, "approved" when the
    // signature lands, and "thinking" once the agent has started work.
    x402HooksRef.current = {
      onSigningStart: ({ amountMicroUsd }) => {
        const usd = (Number(amountMicroUsd) / 1_000_000).toFixed(4);
        setLog((prev) => [
          ...prev,
          {
            kind: "info",
            text: `[402] server asked for ${usd} USDC ceiling · approve EIP-3009 hold in your wallet…`,
          },
        ]);
      },
      onSigned: ({ amountMicroUsd }) => {
        const usd = (Number(amountMicroUsd) / 1_000_000).toFixed(4);
        setLog((prev) => [
          ...prev,
          {
            kind: "success",
            text: `[approved] ${usd} USDC hold signed · agent starting work (overage refunds after)`,
          },
        ]);
        setThinking(true);
      },
    };

    try {
      if (isImage) {
        // Image agents take a one-shot prompt → Gemini image model →
        // PNG on disk. Never run through the guidance envelope (which
        // would turn them into a text model asking clarifying
        // questions with no way for the UI to follow up).
        const data = await callImage(id, message, {
          askerAddress: address.toLowerCase(),
          fetchImpl: x402Fetch,
        });
        setThinking(false);
        if (data.status !== "ready" || !data.imageUrl) {
          setLog((prev) => [
            ...prev,
            { kind: "error", text: `! image ${data.status ?? "failed"}: ${data.error ?? "no image returned"}` },
          ]);
          return;
        }
        if (data.breakdown) setBreakdown(data.breakdown);
        const total = data.breakdown?.totalUsd ?? "?";
        const txTag = data.settlement?.status === "confirmed"
          ? ` · tx ${data.settlement.txHash.slice(0, 10)}…`
          : "";
        setLog((prev) => [
          ...prev,
          { kind: "success", text: `[settled] ${total} USDC charged${txTag}` },
          { kind: "info", text: `[stream] image from ${agent?.name ?? "agent"}` },
          { kind: "image", text: data.imageUrl!, imageId: data.id },
        ]);
        const updated = await fetchAgent(id);
        setAgent(updated);
        setInput("");
        return;
      }

      const result = await askAgent(id, message, {
        askerAddress: address.toLowerCase(),
        conversationId: isFollowUp ? conversationId! : undefined,
        fetchImpl: x402Fetch,
      });
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
      // Envelope handling: a "question" reply keeps the conversation open —
      // user sees it styled differently and can reply without being asked
      // to rate. A "response" (or a 5-turn `capped` forced final) closes
      // the loop, renders as the final `result`, and arms the rating UI.
      const replyType = result.replyType ?? "response";
      const nextTurn = result.turn ?? (isFollowUp ? turn + 1 : 1);
      const capped = !!result.capped;
      if (replyType === "question" && !capped) {
        setConversationId(result.conversationId ?? result.id);
        setTurn(nextTurn);
        setAwaitingReply(true);
        setLog((prev) => [
          ...prev,
          { kind: "success", text: `[settled] ${total} USDC charged · turn ${nextTurn}/${TURN_CAP}` },
          { kind: "info", text: `[stream] ${agent?.name ?? "agent"} asked a clarifying question` },
          { kind: "question", text: result.response ?? "" },
        ]);
      } else {
        setConversationId(null);
        setTurn(0);
        setAwaitingReply(false);
        setLog((prev) => [
          ...prev,
          { kind: "success", text: `[settled] ${total} USDC total charged${capped ? ` · turn ${nextTurn}/${TURN_CAP} (final)` : ""}` },
          { kind: "info", text: `[stream] response from ${agent?.name ?? "agent"}` },
          { kind: "result", text: result.response ?? "" },
        ]);
      }
      const updated = await fetchAgent(id);
      setAgent(updated);
      setInput("");
    } catch (err) {
      setThinking(false);
      if (err instanceof PaymentRequiredError) {
        setLog((prev) => [
          ...prev,
          {
            kind: "error",
            text: `! x402 payment failed: ${err.reason} — check your wallet has enough USDC on Fuji and try again`,
          },
        ]);
      } else {
        setLog((prev) => [...prev, { kind: "error", text: `! error: ${getErrorMessage(err)}` }]);
      }
    } finally {
      setLoading(false);
      // Don't leak hook closures across calls — the next ask builds its own.
      x402HooksRef.current = null;
    }
  };

  const handleRate = async (score: number) => {
    if (rated || ratingInFlight.current) return;
    ratingInFlight.current = true;
    setRating(score);
    try {
      const signature = await signMessageAsync({ message: rateAgentMessage(id, score) });
      const response = await rateAgent(id, score, signature);
      if (agent) {
        setAgent({ ...agent, reputation: response.reputation });
      }
      setRated(true);
      setLog((prev) => [
        ...prev,
        { kind: "success", text: `[rate] ${score}/5 · reputation updated on-chain` },
      ]);
    } catch (err) {
      ratingInFlight.current = false;
      setLog((prev) => [
        ...prev,
        { kind: "error", text: `! rate failed: ${getErrorMessage(err)}` },
      ]);
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
  const isPlatform = !agent.userCreated;
  const category = getCategory(agent);

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
          <TerminalWindow title={`swarm://agent/${agent.id}`} subtitle={CATEGORY_LABEL[category]}>
            <div className="p-5">
              <div className={`text-[10px] uppercase tracking-widest mb-3 ${CATEGORY_TEXT[category]}`}>
                ❯ {CATEGORY_LABEL[category]}
              </div>
              <div className="text-2xl text-foreground mb-1">{agent.name}</div>
              <div className="text-sm text-muted mb-4">{agent.skill}</div>
              <p className="text-sm text-muted leading-relaxed mb-5">{agent.description}</p>

              <div className="space-y-3 text-sm border-t border-border pt-4">
                {[
                  {
                    k: "commission",
                    v: isPlatform ? (
                      <span className="text-dim tabular-nums">
                        $0 <span className="text-dim text-xs">· platform-owned</span>
                      </span>
                    ) : (
                      <span className="text-amber tabular-nums">{agent.price}</span>
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

                <div className="border-t border-border pt-3 mt-3">
                  <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
                    how this bills
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    {isPlatform
                      ? "Platform-owned agent — no commission. You pay measured AI cost + 5% platform margin. Exact breakdown shows after each call."
                      : `You pay ${agent.price} commission (creator gets 100%) + measured AI cost + 5% platform margin. Exact breakdown shows after each call.`}
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
                  Humans are hired through the task board. Post a bounty describing what you need —
                  an expert claims it for verified-specialist work, or a task completer for everyday
                  real-world tasks. They submit the result and get paid instantly in USDC.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/tasks"
                    className="border border-phosphor bg-phosphor px-4 py-2 text-xs font-bold text-background hover:bg-foreground hover:border-foreground transition-none"
                  >
                    [ go to task board ]
                  </Link>
                  <Link
                    href="/become"
                    className="border border-border-hi px-4 py-2 text-xs text-foreground hover:border-phosphor hover:text-phosphor transition-none"
                  >
                    [ list yourself ]
                  </Link>
                </div>
              </div>
            </TerminalWindow>
          ) : (
            <TerminalWindow
              title={`swarm://agent/${agent.id}/ask`}
              subtitle={
                loading
                  ? "asking…"
                  : awaitingReply
                  ? `awaiting reply · turn ${turn}/${TURN_CAP}`
                  : "ready"
              }
              className="h-full flex flex-col"
              bodyClassName="flex-1 flex flex-col"
            >
              <div className="p-0 flex-1 flex flex-col">
                <PromptTextarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    isImage
                      ? `describe the image you want ${agent.name} to generate…`
                      : awaitingReply
                      ? `reply to ${agent.name}'s question…`
                      : `ask ${agent.name} for guidance…`
                  }
                  rows={4}
                  className="border-0 border-b border-border"
                />
                <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-[11px] text-dim uppercase tracking-widest">
                    {isPlatform ? (
                      <>
                        <span className="text-amber">no commission</span>
                        <span className="text-muted"> · AI cost + 5% margin</span>
                      </>
                    ) : (
                      <>
                        commission <span className="text-amber">{agent.price}</span>
                        <span className="text-muted"> + AI cost + 5% margin</span>
                      </>
                    )}
                    {" · settles via x402"}
                    {awaitingReply && (
                      <span className="text-amber"> · follow-up turn {turn}/{TURN_CAP}</span>
                    )}
                  </span>
                  <button
                    onClick={askForGuidance}
                    disabled={loading || !input.trim()}
                    className="border border-amber bg-amber px-4 py-1.5 text-xs font-bold text-background hover:bg-amber-hi transition-none disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <SubmittingLabel
                        text={isImage ? "generating" : awaitingReply ? "replying" : "asking"}
                      />
                    ) : awaitingReply ? (
                      isPlatform ? `[ reply · pay AI cost + 5% ]` : `[ reply · pay ${agent.price}+ ]`
                    ) : isPlatform ? (
                      `[ ${isImage ? "generate" : "ask"} · pay AI cost + 5% ]`
                    ) : (
                      `[ ${isImage ? "generate" : "ask"} · pay ${agent.price}+ ]`
                    )}
                  </button>
                </div>
                <div className="px-4 py-2 border-b border-border bg-surface-1/40 text-[11px] text-dim leading-relaxed">
                  <span className="text-amber">heads up:</span> we pre-approve a
                  per-call ceiling ({isImage ? "≈ $0.21" : "≈ $0.05"}) so the tx
                  clears before we know the exact AI cost. After the agent
                  answers, the overage is refunded to you on-chain — you'll see
                  it as a <span className="text-phosphor">+refund</span> on the
                  same line in your transactions.
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
                        <div className="text-dim text-[10px] uppercase tracking-widest">AI</div>
                        <div className="text-muted">${breakdown.geminiCostUsd}</div>
                        <div className="text-dim text-[10px]">api cost</div>
                      </div>
                      <div>
                        <div className="text-dim text-[10px] uppercase tracking-widest">platform</div>
                        <div className="text-muted">${breakdown.platformFeeUsd}</div>
                        <div className="text-dim text-[10px]">5% margin</div>
                      </div>
                      <div className="text-right">
                        <div className="text-dim text-[10px] uppercase tracking-widest">total</div>
                        <div className="text-amber text-sm font-bold">${breakdown.totalUsd}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex-1 min-h-[220px] bg-background">
                  {log.length === 0 ? (
                    <div className="p-6 text-dim text-sm">
                      {isImage
                        ? "image renders here after you describe what you want."
                        : "guidance streams here after you ask the agent."}
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
                              : line.kind === "question"
                              ? "text-amber"
                              : "text-foreground"
                          }
                        >
                          {line.kind === "result" ? (
                            <pre className="whitespace-pre-wrap border-l border-border pl-3 leading-relaxed">{line.text}</pre>
                          ) : line.kind === "question" ? (
                            <div className="border border-amber/60 bg-amber/5 p-3">
                              <div className="text-[10px] uppercase tracking-widest text-amber mb-1">
                                ❯ specialist asks
                              </div>
                              <pre className="whitespace-pre-wrap leading-relaxed text-foreground">{line.text}</pre>
                              <div className="mt-2 text-[10px] uppercase tracking-widest text-dim">
                                ↑ reply above to continue · rating unlocks after a final answer
                              </div>
                            </div>
                          ) : line.kind === "image" ? (
                            <div className="border border-border bg-surface-1 p-2">
                              {line.imageId ? (
                                <Link
                                  href={`/image/${line.imageId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block hover:opacity-90 transition-none"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={line.text}
                                    alt="generated image"
                                    className="block max-w-full h-auto"
                                  />
                                </Link>
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={line.text}
                                  alt="generated image"
                                  className="block max-w-full h-auto"
                                />
                              )}
                              {line.imageId && (
                                <div className="mt-2 flex items-center justify-end gap-2 flex-wrap">
                                  <Link
                                    href={`/image/${line.imageId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 text-[11px] px-3 py-1.5 border border-border-hi text-foreground hover:border-phosphor hover:text-phosphor transition-none uppercase tracking-widest"
                                    title="open full-screen viewer with prompt, cost, and download"
                                  >
                                    [ view in full ↗ ]
                                  </Link>
                                </div>
                              )}
                            </div>
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

                      {log.find((l) => l.kind === "result" || l.kind === "image") && !rated && !loading && (
                        <div className="pt-3 mt-3 border-t border-border flex flex-wrap items-center gap-3">
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
