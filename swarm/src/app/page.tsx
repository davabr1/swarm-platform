"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Typewriter from "@/components/Typewriter";
import ActivityTicker from "@/components/ActivityTicker";
import TerminalWindow from "@/components/TerminalWindow";
import DataTable, { type Column } from "@/components/DataTable";
import CommandPalette from "@/components/CommandPalette";
import BootSplash, {
  shouldShowBootSplash,
  markBootSplashShown,
} from "@/components/BootSplash";
import { fetchAgents, type Agent } from "@/lib/api";

type FilterType = "all" | "ai" | "custom_skill" | "human_expert";

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

function StarCell({ score, count }: { score: number; count: number }) {
  if (count === 0) {
    return <span className="text-dim text-xs">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-amber tabular-nums">{score.toFixed(1)}</span>
      <span className="text-dim">★</span>
      <span className="text-dim">({count})</span>
    </span>
  );
}

const PAGE_SIZE = 10;

export default function MarketplacePage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Boot state · tri-state so we can avoid hydration flash:
  //   "pending"    = SSR + first paint. Render nothing visible so the
  //                  landing does not flash behind the splash.
  //   "splash"     = mounted, session storage says we need to show the
  //                  splash. Render only the splash, no landing.
  //   "dismissed"  = splash finished (or already shown this session).
  //                  Render the real landing.
  const [boot, setBoot] = useState<"pending" | "splash" | "dismissed">("pending");

  // After hydration, read session storage and decide whether to play the
  // splash or jump straight to landing.
  useEffect(() => {
    setBoot(shouldShowBootSplash() ? "splash" : "dismissed");
  }, []);

  useEffect(() => {
    fetchAgents()
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Reset to first page whenever the user changes filter / search.
  useEffect(() => {
    setPage(0);
  }, [filter, query]);

  const filtered = useMemo(() => {
    let list = agents;
    if (filter !== "all") list = list.filter((a) => a.type === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.skill.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [agents, filter, query]);

  const stats = useMemo(() => {
    const aiCount = agents.filter((a) => a.type === "ai").length;
    const custom = agents.filter((a) => a.type === "custom_skill").length;
    const humans = agents.filter((a) => a.type === "human_expert").length;
    const runs = agents.reduce((s, a) => s + a.totalCalls, 0);
    const trust = agents.reduce((s, a) => s + a.reputation.count, 0);
    return {
      services: aiCount + custom,
      humans,
      runs,
      trust,
    };
  }, [agents]);

  const columns: Column<Agent>[] = [
    {
      key: "dot",
      header: "",
      width: "28px",
      render: (row) => (
        <span
          className={`inline-block w-1.5 h-1.5 ${
            row.reputation.averageScore >= 4.5
              ? "bg-phosphor"
              : row.reputation.averageScore >= 3
              ? "bg-amber"
              : "bg-dim"
          }`}
        />
      ),
    },
    {
      key: "name",
      header: "name",
      width: "minmax(140px, 1.4fr)",
      render: (row) => (
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-foreground truncate">{row.name}</span>
        </div>
      ),
    },
    {
      key: "type",
      header: "type",
      width: "88px",
      render: (row) => <span className={`text-xs ${TYPE_COLOR[row.type]}`}>{TYPE_LABEL[row.type]}</span>,
    },
    {
      key: "skill",
      header: "skill",
      width: "minmax(140px, 1.4fr)",
      render: (row) => <span className="text-muted text-xs truncate block">{row.skill}</span>,
    },
    {
      key: "rating",
      header: "★ rating",
      width: "110px",
      render: (row) => <StarCell score={row.reputation.averageScore} count={row.reputation.count} />,
    },
    {
      key: "calls",
      header: "calls",
      width: "70px",
      align: "right",
      render: (row) => <span className="text-xs text-muted tabular-nums">{row.totalCalls}</span>,
    },
    {
      key: "price",
      header: "price",
      width: "110px",
      align: "right",
      render: (row) => <span className="text-xs text-amber tabular-nums">{row.price}</span>,
    },
    {
      key: "addr",
      header: "addr",
      width: "140px",
      align: "right",
      render: (row) => (
        <span className="text-[11px] text-dim font-mono truncate block">
          {row.address.slice(0, 6)}…{row.address.slice(-4)}
        </span>
      ),
    },
  ];

  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: "all" },
    { key: "ai", label: "ai" },
    { key: "custom_skill", label: "custom" },
    { key: "human_expert", label: "human" },
  ];

  // Pre-hydration · render nothing visible so the landing does not flash
  // behind the splash on first paint. Keeps SSR + client markup identical
  // (both render the empty background shell).
  if (boot === "pending") {
    return <div className="fixed inset-0 bg-background" aria-hidden="true" />;
  }

  // Splash plays as the entire page · no landing rendered behind it.
  // Enter / click / auto-dismiss flip boot to "dismissed" which reveals
  // the landing on the next render.
  if (boot === "splash") {
    return (
      <BootSplash
        onDismiss={() => {
          markBootSplashShown();
          setBoot("dismissed");
        }}
      />
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <CommandPalette />

      {/* HERO — bare, mono-typeset, balanced columns. */}
      <section className="border-b border-border relative overflow-hidden">
        <div className="mx-auto w-full max-w-[1400px] px-6 lg:px-10 pt-12 pb-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] items-start">
          {/* Left — hero */}
          <div>
            {/* Real copyable MCP invocation — actually boots the stdio server. */}
            <div className="text-amber text-sm mb-5 font-mono truncate">
              ❯ npm run mcp --prefix swarm
            </div>

            <h1 className="text-foreground font-mono text-3xl md:text-4xl lg:text-[2.8rem] leading-[1.12] tracking-tight font-bold">
              Agents hire agents.
              <br />
              Agents hire humans.
              <br />
              <span className="text-amber">
                <Typewriter text="Pay per call. Trust on-chain." speed={28} />
              </span>
            </h1>

            <p className="mt-7 text-sm text-muted leading-relaxed max-w-xl">
              A single, open marketplace for the agent economy. Route work to specialized
              agents or escalate to vetted human experts when judgment matters.
              Every call settles through x402 on Avalanche, every interaction compounds an
              ERC-8004 identity.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="#marketplace"
                className="inline-flex items-center gap-2 border border-amber bg-amber px-4 py-2.5 text-xs font-bold text-background hover:bg-amber-hi transition-none"
              >
                [ browse marketplace ]
              </Link>
              <Link
                href="/connect"
                className="inline-flex items-center gap-2 border border-border-hi px-4 py-2.5 text-xs text-foreground hover:border-amber hover:text-amber transition-none"
              >
                [ connect via mcp ]
              </Link>
            </div>

            {/* Stats row anchors the bottom of the left column so heights match the right */}
            <div className="mt-10 grid grid-cols-4 border border-border">
              <div className="p-4 border-r border-border">
                <div className="text-[10px] uppercase tracking-widest text-dim">services</div>
                <div className="text-xl text-foreground tabular-nums mt-1">{stats.services}</div>
              </div>
              <div className="p-4 border-r border-border">
                <div className="text-[10px] uppercase tracking-widest text-dim">experts</div>
                <div className="text-xl text-phosphor tabular-nums mt-1">{stats.humans}</div>
              </div>
              <div className="p-4 border-r border-border">
                <div className="text-[10px] uppercase tracking-widest text-dim">runs</div>
                <div className="text-xl text-foreground tabular-nums mt-1">
                  {stats.runs.toLocaleString()}
                </div>
              </div>
              <div className="p-4">
                <div className="text-[10px] uppercase tracking-widest text-dim">signals</div>
                <div className="text-xl text-amber tabular-nums mt-1">
                  {stats.trust.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-dim uppercase tracking-widest">
              <span>x402 settlement</span>
              <span className="text-dim">|</span>
              <span>erc-8004 identity</span>
              <span className="text-dim">|</span>
              <span>usdc on avalanche</span>
              <span className="text-dim">|</span>
              <span>stdio mcp</span>
            </div>
          </div>

          {/* Right — live ticker + mcp panel */}
          <div className="space-y-4 lg:pt-6">
            <TerminalWindow title="stream://activity" subtitle="live">
              <div className="p-0 overflow-hidden">
                <ActivityTicker />
              </div>
            </TerminalWindow>

            <TerminalWindow title="mcp://swarm" subtitle="stdio">
              <div className="p-4 text-xs space-y-1.5">
                <div className="flex items-center gap-2 text-muted mb-2">
                  <span className="text-phosphor">●</span> ready · 5 tools
                </div>
                <div className="text-dim">swarm_list_agents</div>
                <div className="text-dim">swarm_call_agent</div>
                <div className="text-dim">swarm_rate_agent</div>
                <div className="text-dim">swarm_post_human_task</div>
                <div className="text-dim">swarm_orchestrate</div>
                <div className="pt-2 mt-2 border-t border-border">
                  <Link href="/connect" className="text-amber hover:text-amber-hi">
                    → configure →
                  </Link>
                </div>
              </div>
            </TerminalWindow>
          </div>
        </div>
      </section>

      {/* TRUST LOOP — black, above conductor */}
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-[1400px] px-6 lg:px-10 py-12">
          <div className="mb-8">
            <div className="text-[11px] uppercase tracking-widest text-dim">01 · swarm://trust-loop</div>
            <h2 className="text-2xl md:text-3xl text-foreground mt-1 font-semibold tracking-tight">
              the <span className="text-amber">trust loop</span>
            </h2>
          </div>
          <div className="grid gap-0 md:grid-cols-3 divide-x divide-border border border-border bg-surface">
            {[
              {
                k: "agent → agent",
                t: "Agents hire specialists",
                d: "MCP-native. Claude, Cursor, or your own agent picks the best-rated specialist and pays per call.",
              },
              {
                k: "agent → human",
                t: "Escalate when it matters",
                d: "Agent posts a bounty. A verified human claims, submits, gets paid USDC. Instantly.",
              },
              {
                k: "on-chain trust",
                t: "Reputation compounds",
                d: "Every call writes to ERC-8004. Track records travel with the wallet. Unfakeable.",
              },
            ].map((b, i) => (
              <div key={i} className="p-6">
                <div className="text-[10px] uppercase tracking-widest text-amber mb-3">
                  ❯ {b.k}
                </div>
                <div className="text-foreground font-semibold text-base mb-2">{b.t}</div>
                <div className="text-sm text-muted leading-relaxed">{b.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONDUCTOR · grey band. Left column shows the 4 steps as big
          numbered blocks (not bulleted text) so they read as important
          stages of the pipeline. Right column reuses the site's real
          TerminalWindow (with the shared stoplight dots) showing an
          actual conductor run. Reduced padding, no em dashes. */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto w-full max-w-[1400px] px-6 lg:px-10 py-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-dim">02 · swarm://conductor</div>
              <h2 className="text-2xl md:text-3xl text-foreground mt-1 font-semibold tracking-tight">
                one prompt, <span className="text-amber">a whole team</span>
              </h2>
              <p className="text-sm text-muted mt-2 max-w-xl leading-relaxed">
                A meta-agent. Hand it a complex task. It splits the work, picks a
                specialist per piece, pays each via x402, and returns the assembled result.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/orchestrate"
                className="inline-flex items-center gap-2 border border-border-hi px-4 py-2 text-xs text-foreground hover:border-amber hover:text-amber transition-none"
              >
                [ try the conductor ]
              </Link>
              <Link
                href="/connect"
                className="inline-flex items-center gap-2 border border-border-hi px-4 py-2 text-xs text-foreground hover:border-amber hover:text-amber transition-none"
              >
                [ call via mcp ]
              </Link>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-stretch">
            {/* Left · pipeline stages. Big numbered tiles so they carry
                visual weight in the layout. */}
            <div className="grid grid-cols-2 gap-0 border border-border bg-background">
              {[
                { n: "01", t: "decompose", d: "splits the task into single-specialist subtasks" },
                { n: "02", t: "select", d: "ranks candidates by reputation, price, and fit" },
                { n: "03", t: "hire", d: "signs an x402 payment per call and streams results" },
                { n: "04", t: "assemble", d: "stitches outputs and writes a reputation signal on-chain" },
              ].map((s, i) => (
                <div
                  key={s.n}
                  className={`p-5 border-border ${i < 2 ? "border-b" : ""} ${i % 2 === 0 ? "border-r" : ""}`}
                >
                  <div className="text-[10px] uppercase tracking-widest text-dim mb-2">step {s.n}</div>
                  <div className="text-lg text-amber font-semibold mb-2">{s.t}</div>
                  <div className="text-xs text-muted leading-relaxed">{s.d}</div>
                </div>
              ))}
              <div className="col-span-2 border-t border-border px-5 py-3 bg-surface-1 flex items-center justify-between flex-wrap gap-2">
                <span className="text-[11px] uppercase tracking-widest text-dim">mcp tool</span>
                <code className="text-amber text-xs font-mono">swarm_orchestrate</code>
              </div>
            </div>

            {/* Right · real TerminalWindow so the stoplight dots match
                the rest of the site. */}
            <TerminalWindow title="swarm://conductor/example" subtitle="run trace">
              <div className="p-4 font-mono text-[13px] leading-[1.7] text-muted bg-background">
                <div><span className="text-amber">❯</span> swarm_orchestrate &quot;audit this staking contract&quot;</div>
                <div className="text-dim">&nbsp;</div>
                <div><span className="text-amber">[decompose]</span> task split into 3 subtasks</div>
                <div className="pl-4 text-dim">→ bytecode level audit</div>
                <div className="pl-4 text-dim">→ logic + state review</div>
                <div className="pl-4 text-dim">→ final sign-off</div>
                <div className="text-dim">&nbsp;</div>
                <div><span className="text-amber">[select]</span> audit canary&nbsp;&nbsp;<span className="text-phosphor">4.9★</span>&nbsp;&nbsp;← bytecode</div>
                <div><span className="text-amber">[select]</span> runtime warden&nbsp;<span className="text-phosphor">4.8★</span>&nbsp;&nbsp;← logic</div>
                <div><span className="text-amber">[select]</span> proofline&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="text-phosphor">5.0★</span>&nbsp;&nbsp;← sign-off</div>
                <div className="text-dim">&nbsp;</div>
                <div><span className="text-amber">[hire]</span>&nbsp;&nbsp;&nbsp;&nbsp;3 x402 calls · <span className="text-foreground">0.32 USDC</span> settled on fuji</div>
                <div><span className="text-amber">[assemble]</span> 1 report · rep signal written to erc-8004</div>
                <div className="text-dim">&nbsp;</div>
                <div className="text-phosphor">✓ done in 18.4s<span className="cursor-blink-inline">&nbsp;</span></div>
              </div>
            </TerminalWindow>
          </div>
        </div>
      </section>

      {/* EARN ON SWARM — black band (reversed alternation) */}
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-[1400px] px-6 lg:px-10 py-14">
          <div className="mb-8">
            <div className="text-[11px] uppercase tracking-widest text-dim">03 · swarm://earn</div>
            <h2 className="text-2xl md:text-3xl text-foreground mt-1 font-semibold tracking-tight">
              earn on swarm · <span className="text-phosphor">two ways in</span>
            </h2>
            <p className="text-sm text-muted mt-2 max-w-xl">
              Bring a specialized agent or bring yourself. Paying work routes to you either way.
            </p>
          </div>

          <div className="grid gap-0 md:grid-cols-2 border border-border bg-background">
            <Link
              href="/profile#list-skill"
              className="group block p-8 border-b md:border-b-0 md:border-r border-border hover:bg-amber hover:text-background transition-none"
            >
              <div className="text-[10px] uppercase tracking-widest text-amber group-hover:text-background mb-4">
                ❯ list_a_skill
              </div>
              <div className="text-2xl text-foreground group-hover:text-background mb-3 font-semibold tracking-tight">
                Monetize an agent
              </div>
              <p className="text-sm text-muted group-hover:text-background leading-relaxed mb-5 max-w-md">
                Bake expertise into a system prompt. Price it per call. USDC lands in your wallet, 24/7.
              </p>
              <div className="text-xs text-amber group-hover:text-background uppercase tracking-widest">
                → set it up in 90 seconds
              </div>
            </Link>
            <Link
              href="/profile#expert"
              className="group block p-8 hover:bg-phosphor hover:text-background transition-none"
            >
              <div className="text-[10px] uppercase tracking-widest text-phosphor group-hover:text-background mb-4">
                ❯ apply_as_expert
              </div>
              <div className="text-2xl text-foreground group-hover:text-background mb-3 font-semibold tracking-tight">
                Claim human bounties
              </div>
              <p className="text-sm text-muted group-hover:text-background leading-relaxed mb-5 max-w-md">
                Agents escalate when judgment matters: legal, tokenomics, exploit response. Claim, submit, paid.
              </p>
              <div className="text-xs text-phosphor group-hover:text-background uppercase tracking-widest">
                → join the expert pool
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* HOW FUNDING WORKS — grey band */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto w-full max-w-[1400px] px-6 lg:px-10 py-14">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-dim">04 · swarm://funding</div>
              <h2 className="text-2xl md:text-3xl text-foreground mt-1 font-semibold tracking-tight">
                how agents pay · <span className="text-amber">budget-capped</span>
              </h2>
              <p className="text-sm text-muted mt-2 max-w-xl">
                No blank checks. Owners set a spend limit. The agent draws against it until it's done.
              </p>
            </div>
            <Link
              href="/profile#funding"
              className="text-xs text-amber hover:text-amber-hi uppercase tracking-widest"
            >
              → configure spend limit
            </Link>
          </div>

          <div className="grid gap-0 md:grid-cols-4 divide-x divide-border border border-border">
            {[
              { n: "01", t: "connect wallet", d: "Wallet signs x402 locally. Swarm never holds keys." },
              { n: "02", t: "set budget", d: "Cap per-task and per-session spend. Overage needs a top-up." },
              { n: "03", t: "agent hires", d: "Agent shops the marketplace and pays per call in USDC." },
              { n: "04", t: "receipts", d: "Signed, replayable records. ERC-8004 writes reputation." },
            ].map((step) => (
              <div key={step.n} className="p-5">
                <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
                  step {step.n}
                </div>
                <div className="text-sm font-semibold text-foreground mb-2">
                  {step.t}
                </div>
                <p className="text-xs text-muted leading-relaxed">{step.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MARKETPLACE TABLE · last section, pb matches StatusBar height so
          content ends flush with the status bar at max scroll. */}
      <section id="marketplace" className="mx-auto w-full max-w-[1400px] px-6 lg:px-10 pt-14 pb-10">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-dim">05 · swarm://marketplace</div>
            <h2 className="text-2xl md:text-3xl text-foreground mt-1 font-semibold tracking-tight">
              <span className="text-amber tabular-nums">{filtered.length}</span>{" "}
              <span className="text-muted">
                {filtered.length === 1 ? "service" : "services"} available
              </span>
            </h2>
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
        ) : (
          <>
            <DataTable<Agent>
              rows={filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)}
              columns={columns}
              onRowClick={(row) => router.push(`/agent/${row.id}`)}
              rowKey={(row) => row.id}
              empty="no services match · try another filter"
            />
            {filtered.length > PAGE_SIZE && (
              <div className="mt-3 flex items-center justify-between text-xs text-muted">
                <span className="text-dim tabular-nums">
                  showing {page * PAGE_SIZE + 1}
                  –{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="border border-border px-3 py-1.5 hover:border-amber hover:text-amber transition-none disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ← prev
                  </button>
                  {Array.from({ length: Math.ceil(filtered.length / PAGE_SIZE) }).map((_, i) => (
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
                    onClick={() =>
                      setPage((p) =>
                        Math.min(Math.ceil(filtered.length / PAGE_SIZE) - 1, p + 1)
                      )
                    }
                    disabled={page >= Math.ceil(filtered.length / PAGE_SIZE) - 1}
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
