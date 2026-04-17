"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";
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

          <BalancePanel address={address} />

          {isSelf && <FundingPanel address={address} portfolio={portfolio} onSaved={load} />}
          {isSelf && portfolio.inbox.length > 0 && <InboxPanel inbox={portfolio.inbox} />}

          <div className="grid gap-6 lg:grid-cols-2">
            <AgentsPanel agents={portfolio.agents} />
            <CompletedTasksPanel tasks={portfolio.claimedTasks.filter((t) => t.status === "completed")} />
          </div>

          {isSelf && (
            <PostedTasksPanel tasks={portfolio.postedTasks} />
          )}

          {isSelf && <DisconnectPanel />}
        </div>
      </div>
    </div>
  );
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

function BalancePanel({ address }: { address: string }) {
  const normalized = (address.startsWith("0x") ? address : `0x${address}`) as `0x${string}`;
  const { usdc } = useWalletBalances(normalized);

  return (
    <TerminalWindow title="swarm://profile/balance" subtitle="live · fuji C-chain" dots={false}>
      <div className="p-5 border-t border-border">
        <div className="text-[10px] uppercase tracking-widest text-dim mb-2">USDC balance</div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl text-phosphor tabular-nums">{usdc.formatted}</span>
          <span className="text-xs text-dim">USDC</span>
          {usdc.loading && <span className="text-[10px] text-dim">· syncing</span>}
        </div>
        <div className="text-[10px] text-dim mt-2">
          spendable via x402 payments · gas is covered by the facilitator
        </div>
      </div>
    </TerminalWindow>
  );
}

function FundingPanel({
  address,
  portfolio,
  onSaved,
}: {
  address: string;
  portfolio: ProfilePortfolio;
  onSaved: () => void;
}) {
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
    <TerminalWindow title="swarm://profile/funding" subtitle="per-wallet spend caps" dots={false}>
      <div className="p-5 space-y-5 relative">
        <div
          className="absolute top-3 right-3 group"
          aria-label="About spend caps"
        >
          <span className="inline-flex items-center justify-center w-5 h-5 border border-border text-dim text-[10px] cursor-help hover:border-amber hover:text-amber transition-none">
            i
          </span>
          <div className="pointer-events-none absolute right-0 top-7 w-64 border border-border bg-surface p-3 text-xs text-muted leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity z-10">
            Caps are wallet-scoped and sync across every browser. An agent cannot exceed them without an explicit top-up.
          </div>
        </div>

        <div className="grid gap-0 sm:grid-cols-2 border border-border">
          <label className="block p-5 cursor-text">
            <div className="text-[10px] uppercase tracking-widest text-dim mb-2">per task</div>
            <div className="flex items-baseline">
              <span className="text-2xl text-amber tabular-nums mr-1">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={perTask}
                onChange={(e) => setPerTask(sanitize(e.target.value))}
                className="w-full bg-transparent text-2xl text-amber tabular-nums outline-none border-0 focus:outline-none"
              />
            </div>
          </label>
          <label className="block p-5 cursor-text sm:border-l border-border">
            <div className="text-[10px] uppercase tracking-widest text-dim mb-2">per session</div>
            <div className="flex items-baseline">
              <span className="text-2xl text-amber tabular-nums mr-1">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={perSession}
                onChange={(e) => setPerSession(sanitize(e.target.value))}
                className="w-full bg-transparent text-2xl text-amber tabular-nums outline-none border-0 focus:outline-none"
              />
            </div>
          </label>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="border border-amber bg-amber text-background text-xs font-bold px-4 py-2 hover:bg-amber-hi transition-none disabled:opacity-40"
        >
          {saved ? "[ saved ✓ ]" : saving ? <SubmittingLabel text="saving" /> : "[ save limits ]"}
        </button>
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
              contact email · private, for notifications (not yet wired)
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
