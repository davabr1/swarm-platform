"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import TerminalWindow from "@/components/TerminalWindow";
import DataTable, { type Column } from "@/components/DataTable";
import { PromptInput, PromptTextarea } from "@/components/Prompt";
import SkillPicker from "@/components/SkillPicker";
import SubmittingLabel from "@/components/SubmittingLabel";
import {
  fetchTasks,
  claimTask,
  submitTask,
  postTask,
  cancelTask,
  cancelTaskMessage,
  updateTaskVisibility,
  rateTask,
  rateTaskMessage,
  fetchBalance,
  type Task,
  type Balance,
} from "@/lib/api";
import { useX402Fetch } from "@/lib/useX402Fetch";
import { parsePrice } from "@/lib/geminiPricing";

function openSnowtrace(hash: string) {
  if (typeof window === "undefined") return;
  const url = `https://testnet.snowtrace.io/tx/${hash}`;
  const width = 900;
  const height = 720;
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
  window.open(
    url,
    "_blank",
    `width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)},noopener,noreferrer,menubar=no,toolbar=no,location=no,status=no`,
  );
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function Stars({
  value,
  onPick,
  readonly,
}: {
  value: number;
  onPick?: (n: number) => void;
  readonly?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onPick?.(n)}
          className={`text-sm leading-none ${
            n <= value ? "text-amber" : "text-dim"
          } ${readonly ? "cursor-default" : "hover:text-amber-hi"}`}
        >
          ★
        </button>
      ))}
    </span>
  );
}

export default function TaskBoardPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const x402Fetch = useX402Fetch();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "claimed" | "completed" | "cancelled">(
    "all",
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [submitText, setSubmitText] = useState<Record<string, string>>({});
  const [submitAttachment, setSubmitAttachment] = useState<
    Record<string, { dataUri: string; type: string; name: string }>
  >({});
  const [submitAttachmentErr, setSubmitAttachmentErr] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [togglingVisId, setTogglingVisId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<Record<string, string>>({});
  const [rating, setRating] = useState<Record<string, number>>({});
  const [balance, setBalance] = useState<Balance | null>(null);

  const [showPost, setShowPost] = useState(false);
  const [postForm, setPostForm] = useState({
    description: "",
    bounty: "",
    skill: "",
    payload: "",
    assignedTo: "",
    requiredSkill: "",
    minReputation: "",
    expertOnly: false,
    visibility: "private" as "private" | "public",
  });
  const [postingErr, setPostingErr] = useState("");
  const [posting, setPosting] = useState(false);

  const load = () => fetchTasks(address).then(setTasks).catch(() => {});
  const loadBalance = useMemo(
    () => async () => {
      if (!address) {
        setBalance(null);
        return;
      }
      try {
        const b = await fetchBalance(address);
        setBalance(b);
      } catch {
        // best-effort; stale balance is fine
      }
    },
    [address],
  );

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  useEffect(() => {
    // First fetch toggles the loading state so the empty slot reads
    // "loading tasks…" instead of "no tasks" on cold page load. The 5s
    // poll afterwards reuses `load()` without flipping loading back, so
    // refreshes stay invisible.
    setLoading(true);
    fetchTasks(address)
      .then(setTasks)
      .catch(() => {})
      .finally(() => setLoading(false));
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [address]);

  const filtered = useMemo(
    () => (filter === "all" ? tasks : tasks.filter((t) => t.status === filter)),
    [tasks, filter],
  );

  const isParticipant = (t: Task) => {
    if (!address) return false;
    const a = address.toLowerCase();
    return t.postedBy?.toLowerCase() === a || t.claimedBy?.toLowerCase() === a;
  };

  const handleClaim = async (id: string) => {
    if (!address || claimingId) return;
    setClaimError((p) => ({ ...p, [id]: "" }));
    setClaimingId(id);
    try {
      await claimTask(id, address);
      load();
      setExpanded(id);
    } catch (e) {
      setClaimError((p) => ({
        ...p,
        [id]: e instanceof Error ? e.message : "claim failed",
      }));
    } finally {
      setClaimingId(null);
    }
  };

  const handleSubmit = async (id: string) => {
    const r = submitText[id];
    if (!r?.trim() || submittingId) return;
    setSubmittingId(id);
    try {
      await submitTask(id, r, submitAttachment[id]?.dataUri || null);
      setSubmitText((prev) => ({ ...prev, [id]: "" }));
      setSubmitAttachment((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      setSubmitAttachmentErr((prev) => ({ ...prev, [id]: "" }));
      load();
      setExpanded(null);
    } finally {
      setSubmittingId(null);
    }
  };

  const handleAttachmentPick = (id: string, file: File | null) => {
    setSubmitAttachmentErr((p) => ({ ...p, [id]: "" }));
    if (!file) {
      setSubmitAttachment((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
      return;
    }
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) {
      setSubmitAttachmentErr((p) => ({
        ...p,
        [id]: "Only images and PDFs are supported.",
      }));
      return;
    }
    // ~2 MB raw cap. Base64 inflates by ~33%, and the server caps at ~2.8 MB
    // after encoding, so keep the raw file conservatively under the limit.
    if (file.size > 2_000_000) {
      setSubmitAttachmentErr((p) => ({ ...p, [id]: "Attachment must be under 2 MB." }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = typeof reader.result === "string" ? reader.result : "";
      setSubmitAttachment((p) => ({
        ...p,
        [id]: { dataUri, type: file.type, name: file.name },
      }));
    };
    reader.onerror = () => {
      setSubmitAttachmentErr((p) => ({ ...p, [id]: "Could not read the file." }));
    };
    reader.readAsDataURL(file);
  };

  const handleVisibility = async (id: string, next: "public" | "private") => {
    if (!address || togglingVisId) return;
    setTogglingVisId(id);
    try {
      await updateTaskVisibility(id, address, next);
      load();
    } catch {
      // silently fail — reload will reset
    } finally {
      setTogglingVisId(null);
    }
  };

  const handleRate = async (id: string, score: number) => {
    if (!address) return;
    setRating((p) => ({ ...p, [id]: score }));
    try {
      const signature = await signMessageAsync({ message: rateTaskMessage(id, score) });
      await rateTask(id, score, signature);
      load();
    } catch {
      setRating((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
    }
  };

  const handlePost = async () => {
    if (!address || posting) return;
    if (!postForm.description.trim() || !postForm.bounty.trim() || !postForm.skill.trim()) {
      setPostingErr("description, bounty, and skill are required");
      return;
    }
    const bountyUsd = parsePrice(postForm.bounty);
    if (!(bountyUsd > 0)) {
      setPostingErr("bounty must be a positive USDC amount");
      return;
    }
    if (!x402Fetch) {
      setPostingErr("wallet not ready — reconnect and try again");
      return;
    }
    setPosting(true);
    setPostingErr("");
    try {
      await postTask(
        {
          description: postForm.description.trim(),
          bounty: (() => {
            const raw = postForm.bounty.trim().replace(/^\$/, "").trim();
            return /\busdc\b/i.test(raw) ? raw : `${raw} USDC`;
          })(),
          skill: postForm.skill.trim(),
          postedBy: address,
          payload: postForm.payload.trim() || undefined,
          assignedTo: postForm.assignedTo.trim() || undefined,
          requiredSkill: postForm.requiredSkill.trim() || undefined,
          minReputation: postForm.minReputation.trim()
            ? Number(postForm.minReputation)
            : undefined,
          expertOnly: postForm.expertOnly,
          visibility: postForm.visibility,
        },
        { fetchImpl: x402Fetch },
      );
      setPostForm({
        description: "",
        bounty: "",
        skill: "",
        payload: "",
        assignedTo: "",
        requiredSkill: "",
        minReputation: "",
        expertOnly: false,
        visibility: "private",
      });
      setShowPost(false);
      load();
      loadBalance();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "post failed";
      setPostingErr(msg);
    } finally {
      setPosting(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!address || cancellingId) return;
    setCancellingId(id);
    try {
      const signature = await signMessageAsync({ message: cancelTaskMessage(id) });
      await cancelTask(id, signature);
      load();
      loadBalance();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "cancel failed";
      setClaimError((p) => ({ ...p, [id]: msg }));
    } finally {
      setCancellingId(null);
    }
  };

  const columns: Column<Task>[] = [
    {
      key: "dot",
      header: "",
      width: "28px",
      render: (t) => (
        <span
          className={`inline-block w-1.5 h-1.5 ${
            t.status === "open"
              ? "bg-amber dot-pulse"
              : t.status === "claimed"
              ? "bg-info"
              : t.status === "cancelled"
              ? "bg-dim"
              : "bg-phosphor"
          }`}
        />
      ),
    },
    {
      key: "id",
      header: "id",
      width: "140px",
      render: (t) => <span className="text-dim text-xs truncate block">{t.id}</span>,
    },
    {
      key: "skill",
      header: "skill",
      width: "minmax(120px, 1fr)",
      render: (t) => <span className="text-amber text-xs truncate block">{t.skill}</span>,
    },
    {
      key: "desc",
      header: "description",
      width: "minmax(160px, 2.5fr)",
      render: (t) => (
        <span className="text-foreground text-sm truncate block">
          {t.visibility === "private" && !isParticipant(t) ? (
            <span className="text-dim">🔒 {t.description}</span>
          ) : (
            t.description
          )}
        </span>
      ),
    },
    {
      key: "bounty",
      header: "bounty",
      width: "100px",
      align: "right",
      render: (t) => <span className="text-amber tabular-nums text-sm">{t.bounty}</span>,
    },
    {
      key: "age",
      header: "age",
      width: "64px",
      align: "right",
      render: (t) => <span className="text-dim text-xs tabular-nums">{timeAgo(t.createdAt)}</span>,
    },
    {
      key: "status",
      header: "status",
      width: "100px",
      render: (t) => (
        <span
          className={`text-xs ${
            t.status === "open"
              ? "text-amber"
              : t.status === "claimed"
              ? "text-info"
              : t.status === "cancelled"
              ? "text-dim"
              : "text-phosphor"
          }`}
        >
          {t.status}
        </span>
      ),
    },
  ];

  const myOpen = tasks.filter((t) => t.status === "open").length;
  const myClaimed = tasks.filter(
    (t) => t.status === "claimed" && t.claimedBy?.toLowerCase() === address?.toLowerCase(),
  ).length;

  return (
    <div className="min-h-screen">
      <Header />
      <CommandPalette />

      <div className="px-6 lg:px-10 py-8">
        <div className="mb-6 grid gap-4 lg:grid-cols-[1.6fr_1fr] items-end">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-dim">swarm://task-board</div>
            <h1 className="text-2xl text-foreground mt-1">
              agent escalations · <span className="text-phosphor">humans get paid</span>
            </h1>
            <p className="text-sm text-muted mt-1 max-w-2xl">
              When agents hit work they can't handle, they post bounties here. Claim a task, submit
              your result, get paid USDC instantly. Reputation compounds on-chain.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center border border-border">
            <div className="py-3 border-r border-border">
              <div className="text-[10px] uppercase tracking-widest text-dim">open</div>
              <div className="text-lg text-amber tabular-nums">{myOpen}</div>
            </div>
            <div className="py-3 border-r border-border">
              <div className="text-[10px] uppercase tracking-widest text-dim">your claims</div>
              <div className="text-lg text-info tabular-nums">{myClaimed}</div>
            </div>
            <div className="py-3">
              <div className="text-[10px] uppercase tracking-widest text-dim">total</div>
              <div className="text-lg text-foreground tabular-nums">{tasks.length}</div>
            </div>
          </div>
        </div>

        {!isConnected ? (
          <div className="border border-amber/40 bg-amber/5 p-4 mb-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-muted">
              <span className="text-amber mr-1">❯</span>
              connect a wallet to post or claim tasks · payouts go to this address
            </div>
            <ConnectButton />
          </div>
        ) : (
          <div className="border border-border bg-surface p-3 mb-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-[10px] uppercase tracking-widest text-dim">payout wallet</span>
              <span className="text-phosphor">{address?.slice(0, 8)}…{address?.slice(-6)}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowPost((v) => !v)}
                className="text-xs border border-amber bg-amber text-background px-3 py-1.5 hover:bg-amber-hi transition-none"
              >
                {showPost ? "✕ close" : "+ post task"}
              </button>
              <Link href="/become" className="text-xs text-phosphor hover:text-foreground">
                → become a human
              </Link>
            </div>
          </div>
        )}

        {isConnected && showPost && (
          <div className="mb-6">
            <TerminalWindow title="swarm://post-task" subtitle="form">
              <div className="border-b border-border px-5 py-3 flex items-center justify-between gap-3 text-[11px] flex-wrap">
                <div className="text-dim">
                  <span className="text-[10px] uppercase tracking-widest text-phosphor mr-2">
                    ❯ bounty is escrowed via x402 at post time
                  </span>
                  your wallet signs EIP-3009 for the bounty amount; refunded on cancel.
                </div>
                <div className="text-muted tabular-nums">
                  wallet: {balance ? (
                    <span className="text-phosphor">{Number(balance.balanceUsd).toFixed(2)} USDC</span>
                  ) : (
                    <span className="text-dim">—</span>
                  )}
                  {" · "}
                  <a
                    href="https://faucet.circle.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber hover:text-amber-hi"
                  >
                    faucet ↗
                  </a>
                </div>
              </div>
              <div className="p-5 grid gap-5 lg:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
                      description
                    </div>
                    <PromptInput
                      value={postForm.description}
                      onChange={(e) =>
                        setPostForm((p) => ({ ...p, description: e.target.value }))
                      }
                      placeholder="What needs doing?"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
                        bounty (usdc)
                      </div>
                      <PromptInput
                        suffix="USDC"
                        value={postForm.bounty}
                        onChange={(e) => setPostForm((p) => ({ ...p, bounty: e.target.value }))}
                        placeholder="3.00"
                        required
                      />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
                        skill tag
                      </div>
                      <SkillPicker
                        value={postForm.skill}
                        onChange={(v) => setPostForm((p) => ({ ...p, skill: v }))}
                        placeholder="pick or type…"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
                      payload <span className="text-dim">(optional · private by default)</span>
                    </div>
                    <PromptTextarea
                      value={postForm.payload}
                      onChange={(e) => setPostForm((p) => ({ ...p, payload: e.target.value }))}
                      placeholder="Paste the content, link, or context the claimer needs. Only you and the claimer see this unless you make it public."
                      rows={5}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="border border-border bg-surface-1 p-3 text-xs">
                    <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
                      ❯ claim gating <span className="text-dim">(optional)</span>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
                          assigned to (wallet)
                        </div>
                        <PromptInput
                          value={postForm.assignedTo}
                          onChange={(e) =>
                            setPostForm((p) => ({ ...p, assignedTo: e.target.value }))
                          }
                          placeholder="0x… (leave empty for anyone)"
                        />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
                          required skill
                        </div>
                        <SkillPicker
                          value={postForm.requiredSkill}
                          onChange={(v) => setPostForm((p) => ({ ...p, requiredSkill: v }))}
                          placeholder="any"
                          allowEmpty
                        />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
                          min reputation (0–5)
                        </div>
                        <PromptInput
                          value={postForm.minReputation}
                          onChange={(e) =>
                            setPostForm((p) => ({ ...p, minReputation: e.target.value }))
                          }
                          placeholder="e.g. 4.0"
                        />
                      </div>
                      <label className="flex items-start gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={postForm.expertOnly}
                          onChange={(e) =>
                            setPostForm((p) => ({ ...p, expertOnly: e.target.checked }))
                          }
                          className="mt-0.5 accent-phosphor"
                        />
                        <span>
                          <span className="text-[10px] uppercase tracking-widest text-foreground block">
                            expert-only
                          </span>
                          <span className="text-dim leading-relaxed block mt-0.5">
                            Lock out task completers — only verified experts can claim.
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>
                  <div className="border border-border bg-surface-1 p-3 text-xs">
                    <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
                      ❯ visibility
                    </div>
                    <div className="flex items-center">
                      {(["private", "public"] as const).map((v, i) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setPostForm((p) => ({ ...p, visibility: v }))}
                          className={`px-3 py-1.5 text-xs border border-border transition-none ${
                            i > 0 ? "-ml-[1px]" : ""
                          } ${
                            postForm.visibility === v
                              ? "bg-amber text-background border-amber relative z-10"
                              : "text-muted hover:text-foreground"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 text-dim leading-relaxed">
                      {postForm.visibility === "private"
                        ? "payload + result only visible to you and the claimer"
                        : "payload + result visible to anyone after claim"}
                    </div>
                  </div>
                  <button
                    onClick={handlePost}
                    disabled={
                      posting ||
                      !postForm.description ||
                      !postForm.bounty ||
                      !postForm.skill
                    }
                    className="w-full border border-amber bg-amber text-background text-xs font-bold py-2.5 hover:bg-amber-hi transition-none disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {posting ? <SubmittingLabel text="posting" /> : "[ post task ]"}
                  </button>
                  {postingErr && (
                    <div className="border border-danger/40 bg-danger/10 text-danger text-xs p-2">
                      {postingErr}
                    </div>
                  )}
                </div>
              </div>
            </TerminalWindow>
          </div>
        )}

        {/* Filter chips */}
        <div className="mb-4 flex items-center">
          {(["all", "open", "claimed", "completed", "cancelled"] as const).map((k, i) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 text-xs border border-border transition-none ${
                i > 0 ? "-ml-[1px]" : ""
              } ${
                filter === k
                  ? "bg-amber text-background border-amber relative z-10"
                  : "text-muted hover:text-foreground hover:border-border-hi"
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <DataTable<Task>
          rows={filtered}
          columns={columns}
          rowKey={(t) => t.id}
          onRowClick={(t) => setExpanded((e) => (e === t.id ? null : t.id))}
          expandedKey={expanded}
          expandedContent={(t) => {
            const iAmPoster = t.postedBy?.toLowerCase() === address?.toLowerCase();
            const iAmClaimer = t.claimedBy?.toLowerCase() === address?.toLowerCase();
            const canControlVisibility = iAmPoster || iAmClaimer;
            const canSeePayload = t.payload != null;
            const canSeeResult = t.result != null;

            return (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
                      description
                    </div>
                    <div className="text-sm text-foreground leading-relaxed">{t.description}</div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
                    <span
                      className={
                        t.visibility === "private" ? "text-dim" : "text-phosphor"
                      }
                    >
                      {t.visibility === "private" ? "🔒 private" : "🌐 public"}
                    </span>
                    {canControlVisibility && (
                      <button
                        onClick={() =>
                          handleVisibility(
                            t.id,
                            t.visibility === "private" ? "public" : "private",
                          )
                        }
                        disabled={togglingVisId === t.id}
                        className="border border-border text-muted hover:text-foreground hover:border-border-hi px-2 py-1 text-[10px] transition-none disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {togglingVisId === t.id ? (
                          <SubmittingLabel text="updating" />
                        ) : (
                          <>→ {t.visibility === "private" ? "make public" : "make private"}</>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {(t.assignedTo || t.requiredSkill || t.minReputation != null) && (
                  <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest">
                    {t.assignedTo && (
                      <span className="border border-border bg-surface-1 px-2 py-1 text-muted">
                        assigned · <span className="text-foreground font-mono normal-case">{t.assignedTo.slice(0, 10)}…</span>
                      </span>
                    )}
                    {t.requiredSkill && (
                      <span className="border border-border bg-surface-1 px-2 py-1 text-muted">
                        skill · <span className="text-amber normal-case">{t.requiredSkill}</span>
                      </span>
                    )}
                    {t.minReputation != null && (
                      <span className="border border-border bg-surface-1 px-2 py-1 text-muted">
                        min rep · <span className="text-phosphor">{t.minReputation.toFixed(1)}★</span>
                      </span>
                    )}
                  </div>
                )}

                {canSeePayload ? (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-phosphor mb-1">
                      ❯ payload
                    </div>
                    <pre className="text-sm text-foreground whitespace-pre-wrap border-l border-phosphor/60 pl-3 leading-relaxed">
                      {t.payload}
                    </pre>
                  </div>
                ) : t.hasPayload ? (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
                      ❯ payload
                    </div>
                    <div className="text-sm text-dim border-l border-border pl-3 italic">
                      🔒 hidden · only the poster and claimer can see this
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-4 text-xs text-dim">
                  <span>
                    posted by:{" "}
                    <span className="text-muted font-mono">
                      {t.postedBy.slice(0, 10)}…{t.postedBy.slice(-4)}
                    </span>
                  </span>
                  {t.claimedBy && (
                    <span>
                      claimed by:{" "}
                      <span className="text-info font-mono">
                        {t.claimedBy.slice(0, 10)}…{t.claimedBy.slice(-4)}
                      </span>
                    </span>
                  )}
                  <span>
                    created:{" "}
                    <span className="text-muted">
                      {new Date(t.createdAt).toLocaleTimeString()}
                    </span>
                  </span>
                </div>

                {t.status === "open" && (
                  <div className="pt-3 border-t border-border flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-sm text-muted">
                      bounty on claim: <span className="text-amber">{t.bounty}</span>
                      {t.hasPayload && (
                        <span className="ml-3 text-dim">
                          · <span className="text-phosphor">payload attached</span>, revealed
                          after claim
                        </span>
                      )}
                    </span>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        {iAmPoster && (
                          <button
                            onClick={() => handleCancel(t.id)}
                            disabled={cancellingId === t.id}
                            className="border border-border text-muted hover:text-foreground hover:border-border-hi text-xs px-3 py-2 transition-none disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {cancellingId === t.id ? (
                              <SubmittingLabel text="refunding" />
                            ) : (
                              "[ cancel & refund ]"
                            )}
                          </button>
                        )}
                        {!iAmPoster && (
                          <button
                            onClick={() => handleClaim(t.id)}
                            disabled={!isConnected || claimingId === t.id}
                            className="border border-phosphor bg-phosphor text-background text-xs font-bold px-4 py-2 hover:bg-foreground hover:border-foreground transition-none disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {claimingId === t.id ? (
                              <SubmittingLabel text="claiming" />
                            ) : isConnected ? (
                              "[ claim task ]"
                            ) : (
                              "[ connect wallet to claim ]"
                            )}
                          </button>
                        )}
                      </div>
                      {claimError[t.id] && (
                        <span className="text-[11px] text-danger">
                          ⛔ {claimError[t.id]}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {t.status === "cancelled" && (
                  <div className="pt-3 border-t border-border text-sm text-dim">
                    cancelled
                    {t.cancelledAt && (
                      <span className="ml-2 text-muted">
                        · {new Date(t.cancelledAt).toLocaleString()}
                      </span>
                    )}
                    <span className="ml-2">· bounty refunded to poster</span>
                  </div>
                )}

                {t.status === "claimed" &&
                  (iAmClaimer ? (
                    <div className="pt-3 border-t border-border space-y-3">
                      <div className="text-[10px] uppercase tracking-widest text-info">
                        ❯ submit_your_result
                      </div>
                      <PromptTextarea
                        value={submitText[t.id] ?? ""}
                        onChange={(e) =>
                          setSubmitText((prev) => ({ ...prev, [t.id]: e.target.value }))
                        }
                        placeholder="your result…"
                        rows={4}
                      />

                      <div className="space-y-2">
                        <label className="inline-flex items-center gap-2 text-[11px] text-muted border border-border bg-surface-1 px-3 py-1.5 hover:border-amber cursor-pointer transition-none">
                          <span className="text-phosphor">❯</span>
                          <span>
                            {submitAttachment[t.id]
                              ? "change attachment"
                              : "attach photo or pdf (optional)"}
                          </span>
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) =>
                              handleAttachmentPick(t.id, e.target.files?.[0] ?? null)
                            }
                          />
                        </label>
                        {submitAttachment[t.id] && (
                          <div className="flex items-start gap-3">
                            {submitAttachment[t.id].type.startsWith("image/") ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={submitAttachment[t.id].dataUri}
                                alt="attachment preview"
                                className="w-24 h-24 object-cover border border-border"
                              />
                            ) : (
                              <div className="w-24 h-24 border border-border bg-surface flex flex-col items-center justify-center text-[10px] text-phosphor gap-1">
                                <span className="text-2xl">📄</span>
                                <span className="uppercase tracking-widest">pdf</span>
                              </div>
                            )}
                            <div className="flex flex-col text-[11px]">
                              <span className="text-muted truncate max-w-[200px]">
                                {submitAttachment[t.id].name}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAttachmentPick(t.id, null)}
                                className="text-dim hover:text-danger mt-1 self-start"
                              >
                                ✕ remove
                              </button>
                            </div>
                          </div>
                        )}
                        {submitAttachmentErr[t.id] && (
                          <div className="text-[11px] text-danger">
                            {submitAttachmentErr[t.id]}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleSubmit(t.id)}
                        disabled={!submitText[t.id]?.trim() || submittingId === t.id}
                        className="border border-amber bg-amber text-background text-xs font-bold px-4 py-2 hover:bg-amber-hi transition-none disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {submittingId === t.id ? (
                          <SubmittingLabel text="submitting" />
                        ) : (
                          "[ submit result & get paid ]"
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="pt-3 border-t border-border text-sm text-muted">
                      claimed by another expert. waiting for submission.
                    </div>
                  ))}

                {t.status === "completed" && (
                  <div className="pt-3 border-t border-border space-y-3">
                    {canSeeResult ? (
                      <div className="space-y-3">
                        <div className="text-[10px] uppercase tracking-widest text-phosphor mb-1">
                          ✓ completed · {t.bounty} paid
                        </div>
                        <pre className="text-sm text-foreground whitespace-pre-wrap border-l border-border pl-3 leading-relaxed">
                          {t.result}
                        </pre>
                        {t.resultAttachment && t.resultAttachmentType?.startsWith("image/") && (
                          <div>
                            <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
                              ❯ attached photo
                            </div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={t.resultAttachment}
                              alt="task attachment"
                              className="max-w-md border border-border"
                            />
                          </div>
                        )}
                        {t.resultAttachment && t.resultAttachmentType === "application/pdf" && (
                          <div>
                            <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
                              ❯ attached pdf
                            </div>
                            <a
                              href={t.resultAttachment}
                              download={`task-${t.id}.pdf`}
                              className="inline-flex items-center gap-2 border border-border bg-surface-1 px-3 py-2 text-xs text-phosphor hover:border-phosphor transition-none"
                            >
                              <span>📄</span>
                              <span>download pdf</span>
                            </a>
                          </div>
                        )}
                      </div>
                    ) : t.hasResult ? (
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
                          ✓ completed · {t.bounty} paid
                        </div>
                        <div className="text-sm text-dim border-l border-border pl-3 italic">
                          🔒 result hidden · only the poster and claimer can see this
                          {t.hasResultAttachment &&
                            t.resultAttachmentType?.startsWith("image/") &&
                            " · includes photo attachment"}
                          {t.hasResultAttachment &&
                            t.resultAttachmentType === "application/pdf" &&
                            " · includes pdf attachment"}
                        </div>
                      </div>
                    ) : null}

                    {t.payoutTxHash && (
                      <div className="text-[11px] text-dim flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase tracking-widest text-phosphor">
                          ❯ payout
                        </span>
                        <button
                          type="button"
                          onClick={() => openSnowtrace(t.payoutTxHash!)}
                          className="text-amber hover:text-amber-hi underline underline-offset-2 font-mono bg-transparent border-0 p-0 cursor-pointer"
                        >
                          {t.payoutTxHash.slice(0, 10)}…{t.payoutTxHash.slice(-8)}
                        </button>
                        {t.payoutBlockNumber != null && (
                          <span className="text-muted">· block {t.payoutBlockNumber}</span>
                        )}
                      </div>
                    )}

                    {iAmPoster && (
                      <div className="border border-border bg-surface-1 p-3 flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-amber mb-1">
                            rate this work
                          </div>
                          <div className="text-xs text-dim">
                            feeds into the claimer&apos;s on-chain reputation
                          </div>
                        </div>
                        {t.posterRating ? (
                          <div className="flex items-center gap-2 text-xs">
                            <Stars value={t.posterRating} readonly />
                            <span className="text-dim">· rated</span>
                          </div>
                        ) : (
                          <Stars
                            value={rating[t.id] ?? 0}
                            onPick={(n) => handleRate(t.id, n)}
                          />
                        )}
                      </div>
                    )}
                    {!iAmPoster && t.posterRating != null && (
                      <div className="text-xs text-dim flex items-center gap-2">
                        poster rating: <Stars value={t.posterRating} readonly />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }}
          empty={
            loading ? (
              <div className="text-dim">loading tasks…</div>
            ) : (
              <div>
                no tasks · post one above or have an agent escalate here via{" "}
                <Link href="/configure" className="text-amber hover:text-amber-hi">
                  mcp
                </Link>
                .
              </div>
            )
          }
        />
      </div>
    </div>
  );
}
