"use client";

import { useCallback, useEffect, useState } from "react";
import TerminalWindow from "./TerminalWindow";
import { fetchTransactions, type TransactionEntry } from "@/lib/api";

type FilterKind = "all" | "x402_settle" | "earning" | "refund";

const FILTERS: Array<{ key: FilterKind; label: string }> = [
  { key: "all", label: "all" },
  { key: "x402_settle", label: "x402 spends" },
  { key: "earning", label: "earnings" },
  { key: "refund", label: "refunds" },
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

// Per-kind visual treatment. `earning` is positive (phosphor), `x402_settle`
// is negative (amber — payer paid out). `refund` credits back. Legacy kinds
// (`deposit`/`autonomous_spend`/`manual_spend`) mirror their original styling.
function kindStyle(kind: TransactionEntry["kind"]) {
  switch (kind) {
    case "x402_settle":
      return { color: "text-amber", badge: "x402 ◆", sign: "−" };
    case "earning":
      return { color: "text-phosphor", badge: "earning ★", sign: "+" };
    case "refund":
      return { color: "text-dim", badge: "refund ↺", sign: "+" };
    case "deposit":
      return { color: "text-phosphor", badge: "legacy ↓", sign: "+" };
    case "autonomous_spend":
      return { color: "text-amber", badge: "legacy ◆", sign: "−" };
    case "manual_spend":
      return { color: "text-amber/70", badge: "legacy ●", sign: "−" };
  }
}

function filterBlurb(filter: FilterKind): string {
  switch (filter) {
    case "x402_settle":
      return "Inbound x402 payments — every paid agent call settled peer-to-peer on Fuji via EIP-3009. Snowtrace-linked.";
    case "earning":
      return "Commissions fanned out from the platform to your wallet after an x402 settle on an agent or task you listed. Snowtrace-linked.";
    case "refund":
      return "x402 payments where part of the amount came back to you — overage refunds (ceiling over-charge returned post-call) and task-cancel refunds. Original charge and refund shown on one line.";
    case "all":
    default:
      return "x402 settlements, creator commissions, and legacy pre-x402 rows — unified ledger, newest first. When a charge was partially refunded (overage or task cancel), you'll see charged − refunded = net on one line. Snowtrace-linked.";
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
          {filterBlurb(filter)}
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
              const chargedMicro = BigInt(e.grossMicroUsd);
              const refundMicro = e.refund ? BigInt(e.refund.amountMicroUsd) : BigInt(0);
              const netMicro = chargedMicro - refundMicro;
              const fmt = (micro: bigint) =>
                (Number(micro < BigInt(0) ? -micro : micro) / 1_000_000).toFixed(4);
              const label = e.agentName || e.description || e.refType || "—";
              return (
                <div key={e.id} className="py-2.5 flex items-center gap-3 text-xs">
                  <span
                    className={`w-28 shrink-0 text-[10px] uppercase tracking-widest ${s.color}`}
                  >
                    {s.badge}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-foreground">{label}</span>
                  {e.refund ? (
                    <span
                      className={`tabular-nums shrink-0 text-right ${
                        failed ? "text-danger" : ""
                      }`}
                      title={`Original charge ${fmt(chargedMicro)} USDC · refund ${fmt(refundMicro)} USDC · net paid ${fmt(netMicro)} USDC`}
                    >
                      <span className="text-dim">−{fmt(chargedMicro)}</span>
                      <span className="text-phosphor mx-1">+{fmt(refundMicro)}</span>
                      <span className="text-dim mx-1">=</span>
                      <span className={failed ? "text-danger" : s.color}>
                        −{fmt(netMicro)} USDC
                      </span>
                    </span>
                  ) : (
                    <span
                      className={`tabular-nums shrink-0 ${failed ? "text-danger" : s.color}`}
                    >
                      {s.sign}
                      {fmt(chargedMicro)} USDC
                    </span>
                  )}
                  <span className="shrink-0 w-32 text-right flex flex-col items-end gap-0.5">
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
                    {e.refund?.txHash && (
                      <button
                        onClick={() => openTx(e.refund!.txHash!)}
                        className="text-dim hover:text-phosphor text-[10px] font-mono bg-transparent border-0 p-0 cursor-pointer"
                        title="Refund transaction"
                      >
                        ↺ {e.refund.txHash.slice(0, 6)}…{e.refund.txHash.slice(-4)} ↗
                      </button>
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
