"use client";

import { useCallback, useEffect, useState } from "react";
import TerminalWindow from "./TerminalWindow";
import { fetchTransactions, type TransactionEntry } from "@/lib/api";

type FilterKind = "all" | "autonomous_spend" | "manual_spend" | "earning" | "deposit";

const FILTERS: Array<{ key: FilterKind; label: string }> = [
  { key: "all", label: "all" },
  { key: "deposit", label: "deposits" },
  { key: "autonomous_spend", label: "autonomous" },
  { key: "manual_spend", label: "manual" },
  { key: "earning", label: "earnings" },
];

function openTx(hash: string) {
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

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Per-kind visual treatment. `deposit`/`earning` are positive (phosphor),
// the two `_spend` kinds are negative (amber / muted amber). `refund` is
// always positive (danger on the original row, dim credit here).
function kindStyle(kind: TransactionEntry["kind"]) {
  switch (kind) {
    case "deposit":
      return { color: "text-phosphor", badge: "deposit ↓", sign: "+" };
    case "earning":
      return { color: "text-phosphor", badge: "earning ★", sign: "+" };
    case "autonomous_spend":
      return { color: "text-amber", badge: "autonomous ◆", sign: "−" };
    case "manual_spend":
      return { color: "text-amber/70", badge: "manual ●", sign: "−" };
    case "refund":
      return { color: "text-dim", badge: "refund ↺", sign: "+" };
  }
}

export default function TransactionsPanel({ address }: { address: string }) {
  const [filter, setFilter] = useState<FilterKind>("all");
  const [entries, setEntries] = useState<TransactionEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState("");

  const loadFirst = useCallback(() => {
    fetchTransactions(address, { kind: filter, limit: 25 })
      .then((r) => {
        setEntries(r.entries);
        setCursor(r.nextCursor);
        setHasMore(r.hasMore);
        setErr("");
      })
      .catch(() => setErr("Could not load transactions"));
  }, [address, filter]);

  useEffect(() => {
    loadFirst();
    const iv = setInterval(loadFirst, 15_000);
    return () => clearInterval(iv);
  }, [loadFirst]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await fetchTransactions(address, { kind: filter, limit: 25, cursor });
      setEntries((prev) => [...(prev ?? []), ...r.entries]);
      setCursor(r.nextCursor);
      setHasMore(r.hasMore);
    } catch {
      setErr("Could not load more");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <TerminalWindow
      title="swarm://profile/transactions"
      subtitle={entries ? `${entries.length}${hasMore ? "+" : ""} entries` : "loading"}
      dots={false}
    >
      <div className="p-5">
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => {
                  setFilter(f.key);
                  setEntries(null);
                  setCursor(null);
                }}
                className={`text-[11px] px-2 py-1 border transition-none ${
                  active
                    ? "border-amber bg-amber text-background"
                    : "border-border text-dim hover:text-foreground hover:border-muted"
                }`}
              >
                [ {f.label} ]
              </button>
            );
          })}
        </div>
        <div className="text-[11px] text-dim leading-relaxed mb-4 max-w-2xl">
          Deposits, autonomous MCP spend, manual marketplace spend, creator earnings, and refunds — unified
          ledger, newest first. Confirmed settlements link to Snowtrace.
        </div>
        {err && <div className="text-xs text-danger mb-3">{err}</div>}
        {!entries ? (
          <div className="text-sm text-muted">loading…</div>
        ) : entries.length === 0 ? (
          <div className="text-sm text-muted">no entries yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((e) => {
              const s = kindStyle(e.kind);
              const failed = e.status === "failed" || e.status === "failed_settlement";
              const simulated = e.status === "simulated";
              const amountUsd = Math.abs(Number(e.deltaMicroUsd) / 1_000_000).toFixed(4);
              const label = e.agentName || e.description || e.refType || "—";
              return (
                <div key={e.id} className="py-2.5 flex items-center gap-3 text-xs">
                  <span
                    className={`w-28 shrink-0 text-[10px] uppercase tracking-widest ${s.color}`}
                  >
                    {s.badge}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-foreground">{label}</span>
                  <span
                    className={`tabular-nums shrink-0 ${failed ? "text-danger" : s.color}`}
                  >
                    {s.sign}
                    {amountUsd} USDC
                  </span>
                  <span className="shrink-0 w-32 text-right">
                    {e.txHash ? (
                      <button
                        onClick={() => openTx(e.txHash!)}
                        className="text-phosphor hover:text-amber text-[11px] font-mono bg-transparent border-0 p-0 cursor-pointer"
                      >
                        ✓ {e.txHash.slice(0, 6)}…{e.txHash.slice(-4)} ↗
                      </button>
                    ) : failed ? (
                      <span className="text-danger text-[11px]">✗ {e.status}</span>
                    ) : simulated ? (
                      <span className="text-dim text-[11px]">simulated</span>
                    ) : (
                      <span className="text-dim text-[11px]">—</span>
                    )}
                  </span>
                  <span className="shrink-0 w-10 text-right text-dim text-[10px] tabular-nums">
                    {relativeTime(e.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {hasMore && (
          <div className="mt-4">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="text-[11px] text-amber hover:text-amber-hi bg-transparent border-0 cursor-pointer disabled:opacity-40"
            >
              {loadingMore ? "loading…" : "[ load more ]"}
            </button>
          </div>
        )}
      </div>
    </TerminalWindow>
  );
}
