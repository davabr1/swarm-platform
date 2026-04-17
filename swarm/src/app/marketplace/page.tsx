"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import { fetchAgents, type Agent } from "@/lib/api";

// `img-gen` is a skill-slice, not an agent-type — it picks up every agent
// whose skill starts with "Image ·" regardless of type (ai / custom_skill).
// `custom` is an ownership-slice — only agents made by independent wallets
// (userCreated=true). Platform-seeded demo agents with type="custom_skill"
// are NOT shown here; they surface only in `all`.
// All other keys map 1:1 to the `type` column.
type FilterType = "all" | "ai" | "custom" | "human_expert" | "img-gen";

const TYPE_LABEL: Record<Agent["type"], string> = {
  ai: "ai",
  custom_skill: "custom",
  human_expert: "human",
};

const TYPE_COLOR: Record<Agent["type"], string> = {
  ai: "text-info",
  custom_skill: "text-amber",
  human_expert: "text-phosphor",
};

const PAGE_SIZE = 24;

function AgentCard({ agent }: { agent: Agent }) {
  const { reputation, totalCalls } = agent;
  const scoreColor =
    reputation.averageScore >= 4.5
      ? "bg-phosphor"
      : reputation.averageScore >= 3
        ? "bg-amber"
        : "bg-dim";

  return (
    <Link
      href={`/agent/${agent.id}`}
      className="group block border border-border bg-surface-1 hover:border-amber transition-none p-6 flex flex-col gap-4 min-w-0"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2.5 min-w-0">
          <span className={`inline-block w-2 h-2 shrink-0 ${scoreColor}`} />
          <span className="text-foreground text-base font-semibold truncate">{agent.name}</span>
        </span>
        <span className={`text-[10px] uppercase tracking-widest shrink-0 ${TYPE_COLOR[agent.type]}`}>
          {TYPE_LABEL[agent.type]}
        </span>
      </div>

      <div className="text-sm text-muted leading-snug line-clamp-3 min-h-[3.3em]">
        {agent.skill}
      </div>

      <div className="flex items-center justify-between text-xs mt-auto">
        <span>
          {reputation.count === 0 ? (
            <span className="text-dim">— unrated</span>
          ) : (
            <span className="text-amber tabular-nums">
              {reputation.averageScore.toFixed(1)}{" "}
              <span className="text-dim">★ ({reputation.count})</span>
            </span>
          )}
        </span>
        <span className="text-dim tabular-nums">{totalCalls} calls</span>
      </div>

      <div className="flex items-center justify-between text-xs border-t border-border pt-3">
        <span className="text-dim font-mono">
          {agent.address.slice(0, 6)}…{agent.address.slice(-4)}
        </span>
        <span className="text-amber tabular-nums text-sm font-semibold">{agent.price}</span>
      </div>
    </Link>
  );
}

export default function MarketplacePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetchAgents()
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setPage(0);
  }, [filter, query]);

  const filtered = useMemo(() => {
    let list = agents;
    if (filter === "img-gen") {
      list = list.filter((a) => a.skill.startsWith("Image"));
    } else if (filter === "custom") {
      // Ownership slice — only independent-wallet agents charge a commission,
      // and those are the ones that belong on the "custom" page per the
      // platform's monetization model.
      list = list.filter((a) => a.userCreated);
    } else if (filter !== "all") {
      list = list.filter((a) => a.type === filter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.skill.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [agents, filter, query]);

  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: "all" },
    { key: "ai", label: "ai" },
    { key: "img-gen", label: "img-gen" },
    { key: "custom", label: "custom" },
    { key: "human_expert", label: "human" },
  ];

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="min-h-screen">
      <Header />
      <CommandPalette />

      <section className="mx-auto w-full max-w-[1400px] px-6 lg:px-10 pt-10 pb-14">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-dim">swarm://marketplace</div>
            <h1 className="text-2xl md:text-3xl text-foreground mt-1 font-semibold tracking-tight">
              <span className="text-amber tabular-nums">{filtered.length}</span>{" "}
              <span className="text-muted">
                {filtered.length === 1 ? "service" : "services"} available
              </span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center">
              {filters.map((f, i) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 text-xs border border-border transition-none ${
                    i > 0 ? "-ml-[1px]" : ""
                  } ${
                    filter === f.key
                      ? "bg-amber text-background border-amber z-10 relative"
                      : "text-muted hover:text-foreground hover:border-border-hi"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex items-center border border-border bg-surface-1 h-8 focus-within:border-amber">
              <span className="pl-3 text-dim text-xs">/</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="filter…"
                className="px-2 bg-transparent text-xs w-44 focus:outline-none"
              />
              <span className="pr-3 text-[10px] text-dim">⌘K</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="border border-border bg-surface py-16 text-center text-dim text-sm">
            loading marketplace…
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-border bg-surface py-16 text-center text-dim text-sm">
            no services match · try another filter
          </div>
        ) : (
          <>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {pageRows.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>

            {filtered.length > PAGE_SIZE && (
              <div className="mt-6 flex items-center justify-between text-xs text-muted">
                <span className="text-dim tabular-nums">
                  showing {page * PAGE_SIZE + 1}–
                  {Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="border border-border px-3 py-1.5 hover:border-amber hover:text-amber transition-none disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ← prev
                  </button>
                  {Array.from({ length: pageCount }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i)}
                      className={`border px-3 py-1.5 tabular-nums transition-none -ml-[1px] ${
                        i === page
                          ? "bg-amber text-background border-amber relative z-10"
                          : "border-border hover:border-border-hi hover:text-foreground"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={page >= pageCount - 1}
                    className="border border-border px-3 py-1.5 hover:border-amber hover:text-amber transition-none disabled:opacity-30 disabled:cursor-not-allowed -ml-[1px]"
                  >
                    next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
