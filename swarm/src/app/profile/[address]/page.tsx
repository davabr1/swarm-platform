"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import TerminalWindow from "@/components/TerminalWindow";
import DataTable, { type Column } from "@/components/DataTable";
import CopyChip from "@/components/CopyChip";
import { PromptInput, PromptTextarea } from "@/components/Prompt";
import SubmittingLabel from "@/components/SubmittingLabel";
import WalletPanel from "@/components/WalletPanel";
import PairedMcpsPanel from "@/components/PairedMcpsPanel";
import TransactionsPanel from "@/components/TransactionsPanel";
import FaucetHelp from "@/components/FaucetHelp";
import SavedImagesPanel from "@/components/SavedImagesPanel";
import RequestedImagesPanel from "@/components/RequestedImagesPanel";
import {
  fetchProfile,
  updateProfile,
  deleteAgent,
  updateAgent,
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
  const { address: connected, isConnected } = useAccount();
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
    if (!isConnected) return;
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [load, isConnected]);

  // Profile pages expose wallet-scoped controls (unlink MCP, edit bio, top-up,
  // transactions). Gating the whole page behind a connected wallet makes the
  // "is this me?" check unambiguous and prevents the ghost-state where an
  // unconnected viewer sees their own profile minus every interactive element.
  if (!isConnected) {
    return (
      <div className="min-h-screen">
        <Header />
        <CommandPalette />
        <div className="px-6 lg:px-10 py-16 flex items-center justify-center">
          <div className="w-full max-w-lg">
            <TerminalWindow title="swarm://profile/auth" subtitle="locked">
              <div className="p-8 text-center">
                <div className="text-[10px] uppercase tracking-widest text-amber mb-4">
                  ❯ authentication_required
                </div>
                <div className="text-xl text-foreground mb-3">Connect your wallet to view profiles</div>
                <p className="text-sm text-muted leading-relaxed mb-8 max-w-sm mx-auto">
                  Your wallet is your identity on Swarm. Connect to view profiles, manage
                  paired MCPs, and see transactions.
                </p>
                <div className="flex items-center justify-center">
                  <ConnectButton />
                </div>
                <div className="mt-6 pt-6 border-t border-border text-[11px] text-dim">
                  <Link href="/marketplace" className="text-amber underline hover:text-amber-hi">
                    ← back to marketplace
                  </Link>
                </div>
              </div>
            </TerminalWindow>
          </div>
        </div>
      </div>
    );
  }

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
              {/* If a display name is set, the address lives in the URL
                  breadcrumb above + the wallet chip below — no need to
                  restate it here. Only fall back to the bare address
                  when there's no display name. */}
              {portfolio.profile.displayName ?? (
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

          <MyListingsPanel
            agents={portfolio.agents}
            viewer={viewer}
            isSelf={isSelf}
            onChanged={load}
          />

          <WalletPanel address={address} isSelf={isSelf} />

          <PairedMcpsPanel address={address} isSelf={isSelf} />

          {isSelf && portfolio.inbox.length > 0 && <InboxPanel inbox={portfolio.inbox} />}

          <div className="grid gap-6 lg:grid-cols-2">
            <AgentsPanel
              agents={portfolio.agents.filter((a) => a.type !== "human_expert")}
            />
            <CompletedTasksPanel tasks={portfolio.claimedTasks.filter((t) => t.status === "completed")} />
          </div>

          {isSelf && <PostedTasksPanel tasks={portfolio.postedTasks} />}

          {isSelf && <TransactionsPanel address={address} />}

          <RequestedImagesPanel address={address} isSelf={isSelf} />

          <SavedImagesPanel address={address} isSelf={isSelf} />

          {isSelf && <FaucetHelp />}
        </div>
      </div>
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
          <CopyChip
            value={address}
            display={`${address.slice(0, 8)}…${address.slice(-6)}`}
            size="lg"
          />
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

// Top-of-profile card summarizing the wallet's human listing (from /become).
// A wallet can have at most one human listing — the row's `roles` array holds
// both expert + completer hats, which is why the UI surfaces them as two
// badges driven off the same underlying record. Only the listing owner sees
// the edit / delete controls; other visitors see the roles as status chips.
function MyListingsPanel({
  agents,
  viewer,
  isSelf,
  onChanged,
}: {
  agents: Agent[];
  viewer?: string;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const human = agents.find((a) => a.type === "human_expert");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState("");

  const hasExpert = (human?.roles ?? []).includes("expert");
  const hasCompleter = (human?.roles ?? []).includes("completer");

  // No listing → on your own profile we nudge you to list yourself; on other
  // people's profiles the card stays silent so we don't advertise emptiness.
  if (!human) {
    if (!isSelf) return null;
    return (
      <TerminalWindow
        title="swarm://profile/listings"
        subtitle="not listed"
        dots={false}
      >
        <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm text-muted max-w-xl">
            You haven&apos;t listed yourself yet. List as <span className="text-phosphor">expert</span>{" "}
            to claim expert-only bounties, or <span className="text-phosphor">task completer</span>{" "}
            for real-world errands — or both.
          </div>
          <Link
            href="/become"
            className="shrink-0 border border-phosphor bg-phosphor text-background text-xs font-bold px-4 py-2 hover:bg-foreground hover:border-foreground transition-none"
          >
            [ list yourself → ]
          </Link>
        </div>
      </TerminalWindow>
    );
  }

  const onDelete = async () => {
    if (!viewer || deleting) return;
    const ok =
      typeof window !== "undefined" &&
      window.confirm(
        "Remove your human listing? This unlists you from the marketplace — you can re-list any time from /become.",
      );
    if (!ok) return;
    setDeleting(true);
    setErr("");
    try {
      await deleteAgent(human.id, viewer);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <TerminalWindow
      title="swarm://profile/listings"
      subtitle={`${human.roles.length || 1} role${(human.roles.length || 1) === 1 ? "" : "s"} active`}
      dots={false}
    >
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-wrap gap-2">
            <RoleBadge label="expert" active={hasExpert} />
            <RoleBadge label="task completer" active={hasCompleter} />
          </div>
          {isSelf && !editing && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing(true)}
                className="border border-amber text-amber bg-transparent text-xs px-3 py-1.5 hover:bg-amber hover:text-background transition-none"
              >
                [ edit ]
              </button>
              <button
                onClick={onDelete}
                disabled={deleting}
                className="border border-danger/60 text-danger bg-transparent text-xs px-3 py-1.5 hover:bg-danger hover:text-background transition-none disabled:opacity-40"
              >
                {deleting ? "[ removing… ]" : "[ delete ]"}
              </button>
            </div>
          )}
        </div>

        {!editing && (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
                display name
              </div>
              <div className="text-foreground break-words">{human.name}</div>
              <div className="text-[10px] uppercase tracking-widest text-dim mt-3 mb-1">
                primary skill
              </div>
              <div className="text-amber text-sm break-words">{human.skill}</div>
              {human.description && (
                <>
                  <div className="text-[10px] uppercase tracking-widest text-dim mt-3 mb-1">
                    bio
                  </div>
                  <div className="text-sm text-muted whitespace-pre-wrap break-words">
                    {human.description}
                  </div>
                </>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
                rate
              </div>
              <div className="text-foreground tabular-nums">{human.price}</div>
              <div className="text-[10px] uppercase tracking-widest text-dim mt-3 mb-1">
                reputation
              </div>
              <div className="text-amber tabular-nums text-sm">
                {human.reputation.count > 0
                  ? `${human.reputation.averageScore.toFixed(1)} ★ (${human.reputation.count})`
                  : "— unrated"}
              </div>
            </div>
          </div>
        )}

        {editing && viewer && (
          <EditListingForm
            agent={human}
            viewer={viewer}
            onSaved={() => {
              setEditing(false);
              onChanged();
            }}
            onCancel={() => setEditing(false)}
          />
        )}

        {err && (
          <div className="border border-danger/40 bg-danger/10 text-danger text-xs p-2">
            {err}
          </div>
        )}
      </div>
    </TerminalWindow>
  );
}

function RoleBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-[11px] uppercase tracking-widest ${
        active
          ? "border-phosphor text-phosphor bg-phosphor/10"
          : "border-border text-dim"
      }`}
    >
      <span
        className={`inline-block w-1.5 h-1.5 ${
          active ? "bg-phosphor" : "bg-dim"
        }`}
      />
      {label}
      <span className="text-[10px] opacity-70">{active ? "· active" : "· inactive"}</span>
    </span>
  );
}

function EditListingForm({
  agent,
  viewer,
  onSaved,
  onCancel,
}: {
  agent: Agent;
  viewer: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(agent.name);
  const [skill, setSkill] = useState(agent.skill);
  const [description, setDescription] = useState(agent.description);
  const [price, setPrice] = useState(agent.price);
  const [roles, setRoles] = useState<Set<string>>(new Set(agent.roles));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const toggle = (r: string) =>
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setErr("");
    try {
      await updateAgent(agent.id, viewer, {
        name,
        skill,
        description,
        price,
        roles: Array.from(roles),
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-phosphor mb-1">name</div>
          <PromptInput value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-phosphor mb-1">skill</div>
          <PromptInput value={skill} onChange={(e) => setSkill(e.target.value)} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-phosphor mb-1">rate</div>
          <PromptInput
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="$3/task"
          />
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-phosphor mb-1">
            roles (toggle on/off)
          </div>
          <div className="flex flex-wrap gap-2">
            {(["expert", "completer"] as const).map((r) => {
              const active = roles.has(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggle(r)}
                  className={`border px-2.5 py-1 text-[11px] uppercase tracking-widest ${
                    active
                      ? "border-phosphor bg-phosphor/10 text-phosphor"
                      : "border-border text-dim hover:border-phosphor/60"
                  }`}
                >
                  {r === "completer" ? "task completer" : "expert"}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-phosphor mb-1">bio</div>
          <PromptTextarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="border border-phosphor bg-phosphor text-background text-xs font-bold px-4 py-2 hover:bg-foreground hover:border-foreground transition-none disabled:opacity-40"
          >
            {saving ? <SubmittingLabel text="saving" /> : "[ save changes ]"}
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="border border-border text-muted bg-transparent text-xs px-4 py-2 hover:text-foreground transition-none"
          >
            [ cancel ]
          </button>
        </div>
        {err && (
          <div className="border border-danger/40 bg-danger/10 text-danger text-xs p-2">
            {err}
          </div>
        )}
      </div>
    </div>
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
        <div className="p-6 text-sm text-muted">no AI agents listed yet.</div>
      ) : (
        <DataTable<Agent>
          rows={agents}
          columns={columns}
          rowKey={(a) => a.id}
          dense
          minWidth="360px"
        />
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
        <DataTable<Task>
          rows={tasks}
          columns={columns}
          rowKey={(t) => t.id}
          dense
          minWidth="360px"
        />
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
