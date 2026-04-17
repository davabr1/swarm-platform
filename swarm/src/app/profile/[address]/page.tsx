"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount, useDisconnect, useSignMessage, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import TerminalWindow from "@/components/TerminalWindow";
import DataTable, { type Column } from "@/components/DataTable";
import CopyChip from "@/components/CopyChip";
import { PromptInput, PromptTextarea } from "@/components/Prompt";
import SubmittingLabel from "@/components/SubmittingLabel";
import { useWalletBalances } from "@/lib/useWalletBalances";
import {
  fetchProfile,
  updateProfile,
  type Agent,
  type ProfilePortfolio,
  type Task,
} from "@/lib/api";

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function isAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

function Stars({ rating, count }: { rating: number; count: number }) {
  if (count === 0) return <span className="text-dim text-xs">— unrated</span>;
  return (
    <span className="tabular-nums text-amber text-xs">
      {rating.toFixed(1)} <span className="text-dim">★ ({count})</span>
    </span>
  );
}

export default function PublicProfilePage() {
  const params = useParams<{ address: string }>();
  const address = params.address;
  const { address: connected } = useAccount();
  const viewer = connected?.toLowerCase();
  const isSelf = !!viewer && viewer === address.toLowerCase();

  const [portfolio, setPortfolio] = useState<ProfilePortfolio | null>(null);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    if (!isAddress(address)) {
      setErr("Invalid address");
      return;
    }
    fetchProfile(address, viewer)
      .then(setPortfolio)
      .catch((e: Error) => setErr(e.message));
  }, [address, viewer]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [load]);

  if (err) {
    return (
      <div className="min-h-screen">
        <Header />
        <CommandPalette />
        <div className="px-6 lg:px-10 py-16 text-center">
          <div className="text-[10px] uppercase tracking-widest text-danger mb-2">❯ error</div>
          <div className="text-sm text-muted">{err}</div>
          <Link href="/" className="text-amber hover:text-amber-hi text-sm mt-4 inline-block">
            → back to marketplace
          </Link>
        </div>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="min-h-screen">
        <Header />
        <CommandPalette />
        <div className="px-6 lg:px-10 py-16 text-center text-sm text-muted">loading profile…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <CommandPalette />

      <div className="px-6 lg:px-10 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-dim">
              swarm://profile/{address.slice(0, 10)}…
            </div>
            <h1 className="text-2xl text-foreground mt-1">
              {portfolio.profile.displayName ? (
                <>
                  {portfolio.profile.displayName}{" "}
                  <span className="text-dim">· {address.slice(0, 8)}…{address.slice(-6)}</span>
                </>
              ) : (
                <>
                  {address.slice(0, 10)}…{address.slice(-6)}
                </>
              )}
            </h1>
            {portfolio.profile.bio && (
              <p className="text-sm text-muted mt-1 max-w-2xl whitespace-pre-wrap">
                {portfolio.profile.bio}
              </p>
            )}
          </div>
          {isSelf && (
            <button
              onClick={() => setEditing((v) => !v)}
              className="shrink-0 border border-amber text-amber bg-transparent text-xs font-bold px-4 py-2 hover:bg-amber hover:text-background transition-none"
            >
              {editing ? "[ close ]" : "[ edit ]"}
            </button>
          )}
        </div>

        <div className="grid gap-6">
          {isSelf && editing && (
            <EditProfilePanel
              address={address}
              portfolio={portfolio}
              onSaved={() => {
                load();
                setEditing(false);
              }}
            />
          )}

          <IdentityCard address={address} portfolio={portfolio} />

          <WalletPanel
            address={address}
            portfolio={portfolio}
            isSelf={isSelf}
            onSaved={load}
          />
          {isSelf && portfolio.inbox.length > 0 && <InboxPanel inbox={portfolio.inbox} />}

          <div className="grid gap-6 lg:grid-cols-2">
            <AgentsPanel agents={portfolio.agents} />
            <CompletedTasksPanel tasks={portfolio.claimedTasks.filter((t) => t.status === "completed")} />
          </div>

          {isSelf && (
            <PostedTasksPanel tasks={portfolio.postedTasks} />
          )}

          {isSelf && <McpSessionsPanel address={address} />}

          {isSelf && <SpendHistoryPanel address={address} />}

          {isSelf && <DisconnectPanel />}
        </div>
      </div>
    </div>
  );
}

type McpSessionRow = {
  id: string;
  budgetUsd: number;
  spentUsd: number;
  expiresAt: string;
  createdAt: string;
};

type PairConfig = { orchestrator: string; usdc: string; chainId: number };

const USDC_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function McpSessionsPanel({ address }: { address: string }) {
  const [rows, setRows] = useState<McpSessionRow[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [topupId, setTopupId] = useState<string | null>(null);
  const [topupBudget, setTopupBudget] = useState("10");
  const [topupStage, setTopupStage] = useState<"idle" | "approving" | "awaiting-receipt" | "claiming">("idle");
  const [topupHash, setTopupHash] = useState<`0x${string}` | null>(null);
  const [err, setErr] = useState("");
  const [pairConfig, setPairConfig] = useState<PairConfig | null>(null);
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();
  const { isSuccess: topupReceiptOk, isError: topupReceiptErr } = useWaitForTransactionReceipt({
    hash: topupHash ?? undefined,
  });

  useEffect(() => {
    fetch("/api/pair/config")
      .then((r) => r.json())
      .then((c: PairConfig) => setPairConfig(c))
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    fetch(`/api/profile/${address}/sessions`)
      .then((r) => r.json())
      .then((d: { sessions: McpSessionRow[] }) => setRows(d.sessions ?? []))
      .catch(() => setErr("Could not load sessions"));
  }, [address]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [load]);

  const revoke = async (sessionId: string) => {
    setErr("");
    setRevokingId(sessionId);
    try {
      const issuedAt = Date.now();
      const message = `Swarm session revoke: ${sessionId}@${issuedAt}`;
      const signature = await signMessageAsync({ message });
      const res = await fetch("/api/session/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, issuedAt, signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Revoke failed");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setRevokingId(null);
    }
  };

  const cancelTopup = () => {
    setTopupId(null);
    setTopupStage("idle");
    setTopupHash(null);
    setErr("");
  };

  const startTopup = async (sessionId: string) => {
    if (!pairConfig) {
      setErr("Pair config not loaded yet");
      return;
    }
    const newBudgetUsd = parseFloat(topupBudget);
    if (!Number.isFinite(newBudgetUsd) || newBudgetUsd <= 0 || newBudgetUsd > 200) {
      setErr("New budget must be between 0 and 200 USDC");
      return;
    }
    setErr("");
    const newBudgetMicroUsd = BigInt(Math.round(newBudgetUsd * 1_000_000));
    try {
      setTopupStage("approving");
      const hash = await writeContractAsync({
        abi: USDC_APPROVE_ABI,
        address: pairConfig.usdc as `0x${string}`,
        functionName: "approve",
        args: [pairConfig.orchestrator as `0x${string}`, newBudgetMicroUsd],
      });
      setTopupHash(hash);
      setTopupStage("awaiting-receipt");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Approve rejected");
      setTopupStage("idle");
    }
  };

  // Drive the claim once the approve tx lands.
  useEffect(() => {
    if (topupStage !== "awaiting-receipt" || !topupId) return;
    if (topupReceiptErr) {
      setErr("USDC approve transaction failed on-chain");
      setTopupStage("idle");
      setTopupHash(null);
      return;
    }
    if (!topupReceiptOk) return;
    setTopupStage("claiming");
    (async () => {
      try {
        const newBudgetUsd = parseFloat(topupBudget);
        const issuedAt = Date.now();
        const message = `Swarm session topup: ${topupId}@${issuedAt}@${newBudgetUsd}`;
        const signature = await signMessageAsync({ message });
        const res = await fetch("/api/session/topup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: topupId, newBudgetUsd, issuedAt, signature }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Topup failed");
        cancelTopup();
        load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Topup failed");
        setTopupStage("idle");
      }
    })();
  }, [topupStage, topupReceiptOk, topupReceiptErr, topupId, topupBudget, signMessageAsync, load]);

  const anyActive = rows && rows.length > 0;

  return (
    <TerminalWindow
      title="swarm://profile/mcp-sessions"
      subtitle={rows ? `${rows.length} active` : "loading"}
      dots={false}
    >
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <span
            className={`inline-block w-2 h-2 dot-pulse ${anyActive ? "bg-phosphor" : "bg-dim"}`}
          />
          <span className={`text-sm ${anyActive ? "text-phosphor" : "text-dim"}`}>
            {anyActive
              ? "Agent connected to wallet via MCP"
              : "No agent connected — run `npx -y swarm-marketplace-mcp pair` to authorize one"}
          </span>
        </div>
        <div className="text-[11px] text-dim leading-relaxed mb-4 max-w-2xl">
          Each session is a paired MCP (Claude Code / Cursor / Codex) that can autonomously spend USDC on your behalf up to its budget. Top up to extend without re-pairing. Revoke to stop new spend immediately — the on-chain allowance stays until you explicitly set it to zero from your wallet.
        </div>
        {err && <div className="text-xs text-danger mb-3">{err}</div>}
        {!rows ? (
          <div className="text-sm text-muted">loading sessions…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted">no active MCP sessions.</div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((s) => {
              const pct = s.budgetUsd > 0 ? Math.min(100, (s.spentUsd / s.budgetUsd) * 100) : 0;
              const expiresMs = new Date(s.expiresAt).getTime();
              const daysLeft = Math.max(0, Math.ceil((expiresMs - Date.now()) / (24 * 60 * 60 * 1000)));
              const isTopping = topupId === s.id;
              return (
                <div key={s.id} className="py-3">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-foreground tabular-nums">
                        {s.spentUsd.toFixed(4)} USDC <span className="text-dim">of {s.budgetUsd.toFixed(2)} spent · {daysLeft}d left</span>
                      </div>
                      <div className="h-1 bg-border mt-1 overflow-hidden">
                        <div className="h-full bg-amber" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[10px] text-dim mt-1 font-mono truncate">{s.id}</div>
                    </div>
                    {!isTopping && (
                      <>
                        <button
                          onClick={() => {
                            setTopupId(s.id);
                            setTopupBudget(Math.max(s.budgetUsd, 10).toFixed(2));
                            setErr("");
                          }}
                          className="shrink-0 border border-amber text-amber text-xs px-3 py-1 hover:bg-amber hover:text-background transition-none"
                        >
                          [ top up ]
                        </button>
                        <button
                          onClick={() => revoke(s.id)}
                          disabled={revokingId === s.id}
                          className="shrink-0 border border-dim text-dim text-xs px-3 py-1 hover:border-muted hover:text-muted transition-none disabled:opacity-40"
                        >
                          {revokingId === s.id ? <SubmittingLabel text="revoking" /> : "[ revoke ]"}
                        </button>
                      </>
                    )}
                  </div>
                  {isTopping && (
                    <div className="mt-3 pl-2 border-l-2 border-amber space-y-3">
                      <div className="text-[11px] text-dim leading-relaxed">
                        Set a new total budget for this session. You&apos;ll sign a USDC <code className="text-amber">approve</code> for the new amount (~0.001 AVAX gas) and a short off-chain authorization. The spent counter resets to 0 because <code>approve</code> replaces your on-chain allowance — historical spend stays in your spend history below.
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center border border-border px-3 py-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={topupBudget}
                            onChange={(e) => setTopupBudget(e.target.value.replace(/[^0-9.]/g, ""))}
                            disabled={topupStage !== "idle"}
                            className="w-20 bg-transparent text-amber tabular-nums outline-none border-0"
                          />
                          <span className="text-amber ml-2 text-xs">USDC</span>
                        </div>
                        <button
                          onClick={() => startTopup(s.id)}
                          disabled={topupStage !== "idle"}
                          className="border border-amber bg-amber text-background text-xs font-bold px-3 py-2 hover:bg-amber-hi disabled:opacity-40 transition-none"
                        >
                          {topupStage === "approving" ? (
                            <SubmittingLabel text="sign approve" />
                          ) : topupStage === "awaiting-receipt" ? (
                            <SubmittingLabel text="waiting for tx" />
                          ) : topupStage === "claiming" ? (
                            <SubmittingLabel text="finalizing" />
                          ) : (
                            "[ confirm top-up ]"
                          )}
                        </button>
                        <button
                          onClick={cancelTopup}
                          disabled={topupStage !== "idle"}
                          className="text-[11px] text-dim hover:text-foreground disabled:opacity-40"
                        >
                          cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </TerminalWindow>
  );
}

type SpendEntry = {
  id: string;
  type: "guidance" | "image";
  agentId: string;
  agentName: string;
  totalUsd: string | null;
  commissionUsd: string | null;
  settlementTxHash: string | null;
  settlementStatus: string | null;
  status: string;
  createdAt: number;
};

function SpendHistoryPanel({ address }: { address: string }) {
  const [entries, setEntries] = useState<SpendEntry[] | null>(null);
  const [totalSpent, setTotalSpent] = useState(0);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    fetch(`/api/profile/${address}/spending`)
      .then((r) => r.json())
      .then((d: { entries: SpendEntry[]; totalSpentUsd: number }) => {
        setEntries(d.entries ?? []);
        setTotalSpent(d.totalSpentUsd ?? 0);
      })
      .catch(() => setErr("Could not load spend history"));
  }, [address]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [load]);

  const openTx = (hash: string) => {
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
  };

  return (
    <TerminalWindow
      title="swarm://profile/spending"
      subtitle={entries ? `${entries.length} calls · ${totalSpent.toFixed(4)} USDC` : "loading"}
      dots={false}
    >
      <div className="p-5">
        <div className="text-[11px] text-dim leading-relaxed mb-4 max-w-2xl">
          Every guidance or image call your MCP-paired agents have autonomously paid for, newest first. Confirmed on-chain settlements link to Snowtrace.
        </div>
        {err && <div className="text-xs text-danger mb-3">{err}</div>}
        {!entries ? (
          <div className="text-sm text-muted">loading spend…</div>
        ) : entries.length === 0 ? (
          <div className="text-sm text-muted">no autonomous spend yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((e) => {
              const amt = e.totalUsd ? parseFloat(e.totalUsd).toFixed(4) : "0.0000";
              const relTime = relativeTime(e.createdAt);
              const failed = e.status === "failed_settlement";
              const simulated = e.settlementStatus === "simulated" || e.settlementStatus === "skipped";
              const confirmed = e.settlementStatus === "confirmed" && e.settlementTxHash;
              return (
                <div key={e.id} className="py-2.5 flex items-center gap-3 text-xs">
                  <span className="w-16 shrink-0 text-dim uppercase tracking-widest text-[10px]">
                    {e.type}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-foreground">{e.agentName}</span>
                  <span
                    className={`tabular-nums shrink-0 ${failed ? "text-danger" : "text-amber"}`}
                  >
                    {amt} USDC
                  </span>
                  <span className="shrink-0 w-28 text-right">
                    {confirmed && e.settlementTxHash ? (
                      <button
                        onClick={() => openTx(e.settlementTxHash!)}
                        className="text-phosphor hover:text-amber text-[11px] font-mono bg-transparent border-0 p-0 cursor-pointer"
                      >
                        ✓ {e.settlementTxHash.slice(0, 6)}…{e.settlementTxHash.slice(-4)} ↗
                      </button>
                    ) : failed ? (
                      <span className="text-danger text-[11px]">✗ {e.settlementStatus ?? "failed"}</span>
                    ) : simulated ? (
                      <span className="text-dim text-[11px]">simulated</span>
                    ) : (
                      <span className="text-dim text-[11px]">—</span>
                    )}
                  </span>
                  <span className="shrink-0 w-10 text-right text-dim text-[10px] tabular-nums">
                    {relTime}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </TerminalWindow>
  );
}

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function DisconnectPanel() {
  const { disconnect } = useDisconnect();
  return (
    <div className="flex justify-end pt-4 border-t border-border">
      <button
        onClick={() => disconnect()}
        className="border border-danger text-danger text-xs px-4 py-2 hover:bg-danger hover:text-background transition-none"
      >
        [ disconnect wallet ]
      </button>
    </div>
  );
}

function IdentityCard({ address, portfolio }: { address: string; portfolio: ProfilePortfolio }) {
  const agentCount = portfolio.agents.length;
  const avgRep = useMemo(() => {
    const withRatings = portfolio.agents.filter((a) => a.reputation.count > 0);
    if (withRatings.length === 0) return 0;
    return (
      withRatings.reduce((s, a) => s + a.reputation.averageScore, 0) / withRatings.length
    );
  }, [portfolio.agents]);
  const completedCount = portfolio.claimedTasks.filter((t) => t.status === "completed").length;

  return (
    <TerminalWindow title="swarm://profile/identity" subtitle="public">
      <div className="p-5 grid gap-6 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <div className="text-[10px] uppercase tracking-widest text-dim mb-2">wallet</div>
          <CopyChip value={address} display={`${address.slice(0, 8)}…${address.slice(-6)}`} />
          {portfolio.profile.email && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-widest text-dim">contact</div>
              <div className="text-sm text-muted">{portfolio.profile.email}</div>
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-dim mb-2">agents listed</div>
          <div className="text-lg text-foreground tabular-nums">{agentCount}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-dim mb-2">avg reputation</div>
          <div className="text-lg text-amber tabular-nums">
            {avgRep > 0 ? `${avgRep.toFixed(1)} ★` : "—"}
          </div>
        </div>
        <div className="lg:col-span-4 border-t border-border pt-3 flex gap-6 text-xs text-dim">
          <span>
            completed tasks: <span className="text-foreground tabular-nums">{completedCount}</span>
          </span>
          <span>
            posted tasks: <span className="text-foreground tabular-nums">{portfolio.postedTasks.length}</span>
          </span>
        </div>
      </div>
    </TerminalWindow>
  );
}

function AgentsPanel({ agents }: { agents: Agent[] }) {
  const columns: Column<Agent>[] = [
    {
      key: "name",
      header: "name",
      width: "minmax(120px, 1.3fr)",
      render: (a) => (
        <Link href={`/agent/${a.id}`} className="text-foreground hover:text-amber">
          {a.name}
        </Link>
      ),
    },
    {
      key: "skill",
      header: "skill",
      width: "minmax(100px, 1fr)",
      render: (a) => <span className="text-muted text-xs truncate block">{a.skill}</span>,
    },
    {
      key: "calls",
      header: "calls",
      width: "60px",
      align: "right",
      render: (a) => <span className="tabular-nums text-muted text-xs">{a.totalCalls}</span>,
    },
    {
      key: "stars",
      header: "★",
      width: "120px",
      align: "right",
      render: (a) => <Stars rating={a.reputation.averageScore} count={a.reputation.count} />,
    },
  ];

  return (
    <TerminalWindow title="swarm://profile/agents" subtitle={`${agents.length} listed`} dots={false}>
      {agents.length === 0 ? (
        <div className="p-6 text-sm text-muted">no agents listed yet.</div>
      ) : (
        <DataTable<Agent> rows={agents} columns={columns} rowKey={(a) => a.id} dense />
      )}
    </TerminalWindow>
  );
}

function CompletedTasksPanel({ tasks }: { tasks: Task[] }) {
  const columns: Column<Task>[] = [
    {
      key: "skill",
      header: "skill",
      width: "minmax(120px, 1.2fr)",
      render: (t) => <span className="text-amber text-xs truncate block">{t.skill}</span>,
    },
    {
      key: "desc",
      header: "task",
      width: "minmax(160px, 2fr)",
      render: (t) => (
        <span className="text-muted text-xs truncate block">{t.description}</span>
      ),
    },
    {
      key: "bounty",
      header: "paid",
      width: "80px",
      align: "right",
      render: (t) => <span className="text-amber tabular-nums text-xs">{t.bounty}</span>,
    },
    {
      key: "rating",
      header: "★",
      width: "80px",
      align: "right",
      render: (t) =>
        t.posterRating ? (
          <span className="tabular-nums text-amber text-xs">{t.posterRating}/5</span>
        ) : (
          <span className="text-dim text-xs">—</span>
        ),
    },
  ];

  return (
    <TerminalWindow title="swarm://profile/completed" subtitle={`${tasks.length} tasks`} dots={false}>
      {tasks.length === 0 ? (
        <div className="p-6 text-sm text-muted">no completed tasks yet.</div>
      ) : (
        <DataTable<Task> rows={tasks} columns={columns} rowKey={(t) => t.id} dense />
      )}
    </TerminalWindow>
  );
}

function PostedTasksPanel({ tasks }: { tasks: Task[] }) {
  const columns: Column<Task>[] = [
    {
      key: "id",
      header: "id",
      width: "140px",
      render: (t) => <span className="text-dim text-xs">{t.id}</span>,
    },
    {
      key: "skill",
      header: "skill",
      width: "minmax(120px, 1fr)",
      render: (t) => <span className="text-muted text-xs truncate block">{t.skill}</span>,
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
              : "text-phosphor"
          }`}
        >
          {t.status}
        </span>
      ),
    },
    {
      key: "bounty",
      header: "bounty",
      width: "90px",
      align: "right",
      render: (t) => <span className="text-amber tabular-nums text-xs">{t.bounty}</span>,
    },
    {
      key: "age",
      header: "age",
      width: "60px",
      align: "right",
      render: (t) => <span className="text-dim text-xs tabular-nums">{timeAgo(t.createdAt)}</span>,
    },
  ];

  return (
    <TerminalWindow title="swarm://profile/posted" subtitle={`${tasks.length} you posted`} dots={false}>
      {tasks.length === 0 ? (
        <div className="p-6 text-sm text-muted">no tasks posted yet.</div>
      ) : (
        <DataTable<Task> rows={tasks} columns={columns} rowKey={(t) => t.id} dense />
      )}
    </TerminalWindow>
  );
}

function InboxPanel({ inbox }: { inbox: Task[] }) {
  return (
    <TerminalWindow
      title="swarm://profile/inbox"
      subtitle={`${inbox.length} matching · click to claim`}
      dots={false}
    >
      <div className="divide-y divide-border">
        {inbox.map((t) => (
          <Link
            key={t.id}
            href={`/tasks#${t.id}`}
            className="block p-4 hover:bg-surface-1 transition-none"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
                  <span className="text-phosphor">{t.skill}</span>
                  {t.assignedTo && <span className="text-amber">· assigned to you</span>}
                  {t.minReputation != null && t.minReputation > 0 && (
                    <span className="text-dim">· requires ★ {t.minReputation.toFixed(1)}+</span>
                  )}
                </div>
                <div className="text-sm text-foreground mt-1 truncate">{t.description}</div>
              </div>
              <div className="text-amber tabular-nums text-sm shrink-0">{t.bounty}</div>
            </div>
          </Link>
        ))}
      </div>
    </TerminalWindow>
  );
}

// Merged balance + spend-caps panel. Balance is always visible (live
// read from chain); caps + save button only render for the wallet owner.
// Previously these were two stacked TerminalWindows — conceptually one
// section ("your money: what you have, what you'll let agents spend").
function WalletPanel({
  address,
  portfolio,
  isSelf,
  onSaved,
}: {
  address: string;
  portfolio: ProfilePortfolio;
  isSelf: boolean;
  onSaved: () => void;
}) {
  const normalized = (address.startsWith("0x") ? address : `0x${address}`) as `0x${string}`;
  const { usdc } = useWalletBalances(normalized);

  const [perTask, setPerTask] = useState(portfolio.profile.spendCapPerTask ?? "5.00");
  const [perSession, setPerSession] = useState(portfolio.profile.spendCapPerSession ?? "50.00");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile(address, address, {
        spendCapPerTask: perTask,
        spendCapPerSession: perSession,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const sanitize = (v: string) => v.replace(/[^0-9.]/g, "");

  return (
    <TerminalWindow
      title="swarm://profile/wallet"
      subtitle={isSelf ? "live balance · per-wallet spend caps" : "live · fuji C-chain"}
      dots={false}
    >
      <div className="p-5">
        <div className={`grid gap-6 ${isSelf ? "lg:grid-cols-3" : ""}`}>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-dim mb-2">USDC balance</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl text-phosphor tabular-nums">{usdc.formatted}</span>
              <span className="text-xs text-dim">USDC</span>
              {usdc.loading && <span className="text-[10px] text-dim">· syncing</span>}
            </div>
            <div className="text-[10px] text-dim mt-2 leading-relaxed">
              spendable via x402 · gas covered by the facilitator
            </div>
          </div>

          {isSelf && (
            <>
              <label className="cursor-text block">
                <div className="text-[10px] uppercase tracking-widest text-dim mb-2">per-task cap</div>
                <div className="flex items-baseline">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={perTask}
                    onChange={(e) => setPerTask(sanitize(e.target.value))}
                    className="w-full bg-transparent text-2xl text-amber tabular-nums outline-none border-0 focus:outline-none"
                  />
                  <span className="text-sm text-amber ml-2">USDC</span>
                </div>
              </label>
              <label className="cursor-text block">
                <div className="text-[10px] uppercase tracking-widest text-dim mb-2">per-session cap</div>
                <div className="flex items-baseline">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={perSession}
                    onChange={(e) => setPerSession(sanitize(e.target.value))}
                    className="w-full bg-transparent text-2xl text-amber tabular-nums outline-none border-0 focus:outline-none"
                  />
                  <span className="text-sm text-amber ml-2">USDC</span>
                </div>
              </label>
            </>
          )}
        </div>

        {isSelf && (
          <div className="mt-5 pt-4 border-t border-border flex items-center justify-between gap-4 flex-wrap">
            <div className="text-[11px] text-dim leading-relaxed max-w-xl">
              caps are wallet-scoped and sync across every browser · an agent cannot exceed them without an explicit top-up
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="shrink-0 border border-amber bg-amber text-background text-xs font-bold px-4 py-2 hover:bg-amber-hi transition-none disabled:opacity-40"
            >
              {saved ? "[ saved ✓ ]" : saving ? <SubmittingLabel text="saving" /> : "[ save limits ]"}
            </button>
          </div>
        )}
      </div>
    </TerminalWindow>
  );
}

function EditProfilePanel({
  address,
  portfolio,
  onSaved,
}: {
  address: string;
  portfolio: ProfilePortfolio;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(portfolio.profile.displayName ?? "");
  const [bio, setBio] = useState(portfolio.profile.bio ?? "");
  const [email, setEmail] = useState(portfolio.profile.email ?? "");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile(address, address, { displayName, bio, email });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <TerminalWindow title="swarm://profile/edit" subtitle="visible to everyone" dots={false}>
      <div className="p-5 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-dim mb-2">display name</div>
            <PromptInput
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="how others see you on the marketplace"
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-dim mb-2">
              contact email · private, for notifications
            </div>
            <PromptInput
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              type="email"
            />
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-dim mb-2">
              bio · what do you do, what do you vouch for
            </div>
            <PromptTextarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="One paragraph. Agents will read this before hiring you."
              rows={5}
            />
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="border border-phosphor bg-phosphor text-background text-xs font-bold px-4 py-2 hover:bg-foreground hover:border-foreground transition-none disabled:opacity-40"
          >
            {saved ? "[ saved ✓ ]" : saving ? <SubmittingLabel text="saving" /> : "[ save profile ]"}
          </button>
        </div>
      </div>
    </TerminalWindow>
  );
}
