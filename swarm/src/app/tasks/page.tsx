"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import TerminalWindow from "@/components/TerminalWindow";
import DataTable, { type Column } from "@/components/DataTable";
import { PromptTextarea } from "@/components/Prompt";
import { fetchTasks, claimTask, submitTask, type Task } from "@/lib/api";

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function TaskBoardPage() {
  const { address, isConnected } = useAccount();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<"all" | "open" | "claimed" | "completed">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [submitText, setSubmitText] = useState<Record<string, string>>({});

  const load = () => fetchTasks().then(setTasks).catch(() => {});

  useEffect(() => {
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? tasks : tasks.filter((t) => t.status === filter)),
    [tasks, filter]
  );

  const handleClaim = async (id: string) => {
    if (!address) return;
    await claimTask(id, address);
    load();
    setExpanded(id);
  };

  const handleSubmit = async (id: string) => {
    const r = submitText[id];
    if (!r?.trim()) return;
    await submitTask(id, r);
    setSubmitText((prev) => ({ ...prev, [id]: "" }));
    load();
    setExpanded(null);
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
      render: (t) => <span className="text-foreground text-sm truncate block">{t.description}</span>,
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
    (t) => t.status === "claimed" && t.claimedBy?.toLowerCase() === address?.toLowerCase()
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

        {/* Wallet strip */}
        {!isConnected ? (
          <div className="border border-amber/40 bg-amber/5 p-4 mb-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-muted">
              <span className="text-amber mr-1">❯</span>
              connect a wallet to claim tasks · payouts go to this address
            </div>
            <ConnectButton />
          </div>
        ) : (
          <div className="border border-border bg-surface p-3 mb-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-[10px] uppercase tracking-widest text-dim">payout wallet</span>
              <span className="text-phosphor">{address?.slice(0, 8)}…{address?.slice(-6)}</span>
            </div>
            <Link
              href="/profile#expert"
              className="text-xs text-amber hover:text-amber-hi"
            >
              → become an expert
            </Link>
          </div>
        )}

        {/* Filter chips */}
        <div className="mb-4 flex items-center">
          {(["all", "open", "claimed", "completed"] as const).map((k, i) => (
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
          expandedContent={(t) => (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-dim mb-1">description</div>
                <div className="text-sm text-foreground leading-relaxed">{t.description}</div>
              </div>
              {t.hasPayload && t.status !== "open" && t.payload && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-phosphor mb-1">
                    ❯ payload · revealed on claim
                  </div>
                  <pre className="text-sm text-foreground whitespace-pre-wrap border-l border-phosphor/60 pl-3 leading-relaxed">
                    {t.payload}
                  </pre>
                </div>
              )}
              <div className="flex items-center gap-4 text-xs text-dim">
                <span>posted by: <span className="text-muted">{t.postedBy}</span></span>
                {t.claimedBy && (
                  <span>claimed by: <span className="text-info">{t.claimedBy.slice(0, 8)}…</span></span>
                )}
                <span>created: <span className="text-muted">{new Date(t.createdAt).toLocaleTimeString()}</span></span>
              </div>

              {t.status === "open" && (
                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-sm text-muted">
                    bounty on claim: <span className="text-amber">{t.bounty}</span>
                    {t.hasPayload && (
                      <span className="ml-3 text-dim">
                        · <span className="text-phosphor">payload attached</span>, revealed after claim
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => handleClaim(t.id)}
                    disabled={!isConnected}
                    className="border border-phosphor bg-phosphor text-background text-xs font-bold px-4 py-2 hover:bg-foreground hover:border-foreground transition-none disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isConnected ? "[ claim task ]" : "[ connect wallet to claim ]"}
                  </button>
                </div>
              )}

              {t.status === "claimed" &&
                (t.claimedBy?.toLowerCase() === address?.toLowerCase() ? (
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
                    <button
                      onClick={() => handleSubmit(t.id)}
                      disabled={!submitText[t.id]?.trim()}
                      className="border border-amber bg-amber text-background text-xs font-bold px-4 py-2 hover:bg-amber-hi transition-none disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      [ submit result & get paid ]
                    </button>
                  </div>
                ) : (
                  <div className="pt-3 border-t border-border text-sm text-muted">
                    claimed by another expert. waiting for submission.
                  </div>
                ))}

              {t.status === "completed" && t.result && (
                <div className="pt-3 border-t border-border">
                  <div className="text-[10px] uppercase tracking-widest text-phosphor mb-1">
                    ✓ completed · {t.bounty} paid
                  </div>
                  <pre className="text-sm text-foreground whitespace-pre-wrap border-l border-border pl-3 leading-relaxed">
                    {t.result}
                  </pre>
                </div>
              )}
            </div>
          )}
          empty={
            <div>
              no tasks · give the{" "}
              <Link href="/orchestrate" className="text-amber hover:text-amber-hi">
                conductor
              </Link>{" "}
              a hard task and it'll post one here.
            </div>
          }
        />
      </div>
    </div>
  );
}
