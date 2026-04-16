"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useBalance } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import TerminalWindow from "@/components/TerminalWindow";
import { PromptInput, PromptTextarea } from "@/components/Prompt";
import CopyChip from "@/components/CopyChip";
import DataTable, { type Column } from "@/components/DataTable";
import {
  fetchAgents,
  fetchTasks,
  createCustomAgent,
  applyAsExpert,
  type Agent,
  type Task,
} from "@/lib/api";

function NotConnected() {
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
              <div className="text-xl text-foreground mb-3">
                Connect your wallet to continue
              </div>
              <p className="text-sm text-muted leading-relaxed mb-8 max-w-sm mx-auto">
                Your Avalanche wallet is your identity on Swarm. It signs payments,
                receives payouts, and anchors your on-chain reputation. No accounts.
              </p>
              <div className="flex items-center justify-center">
                <ConnectButton />
              </div>
              <div className="mt-6 pt-6 border-t border-border flex flex-wrap items-center justify-center gap-4 text-[11px] text-dim uppercase tracking-widest">
                <span>avalanche fuji</span>
                <span>·</span>
                <span>metamask / rainbow / wc</span>
                <span>·</span>
                <span>no password</span>
              </div>
            </div>
          </TerminalWindow>
        </div>
      </div>
    </div>
  );
}

function FundingPanel({ address }: { address: `0x${string}` }) {
  const storageKey = `swarm-budget-${address.toLowerCase()}`;
  const [perTask, setPerTask] = useState("5.00");
  const [perSession, setPerSession] = useState("50.00");
  const [autoTopup, setAutoTopup] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.perTask) setPerTask(parsed.perTask);
      if (parsed.perSession) setPerSession(parsed.perSession);
      setAutoTopup(Boolean(parsed.autoTopup));
    } catch {
      // ignore
    }
  }, [storageKey]);

  const save = () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ perTask, perSession, autoTopup })
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const perTaskNum = Number(perTask) || 0;
  const perSessionNum = Number(perSession) || 0;

  return (
    <TerminalWindow title="swarm://profile/funding" subtitle="agent spend limit">
      <div className="p-5 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <div className="text-[11px] uppercase tracking-widest text-amber">
            ❯ how this works
          </div>
          <p className="text-sm text-muted leading-relaxed">
            When your conductor agent seeks out specialists on your behalf, every x402
            payment is signed by this wallet. Swarm never holds your keys. Set a per-task
            and per-session ceiling so a runaway agent can't drain you. Overages require an
            explicit top-up.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-dim mb-1.5">
                per-task cap (usdc)
              </div>
              <div className="flex items-center border border-border bg-surface-1">
                <span className="pl-3 text-dim text-sm">$</span>
                <input
                  type="text"
                  value={perTask}
                  onChange={(e) => setPerTask(e.target.value)}
                  className="flex-1 bg-transparent px-2 py-2 text-sm text-foreground font-mono tabular-nums"
                />
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-dim mb-1.5">
                per-session cap (usdc)
              </div>
              <div className="flex items-center border border-border bg-surface-1">
                <span className="pl-3 text-dim text-sm">$</span>
                <input
                  type="text"
                  value={perSession}
                  onChange={(e) => setPerSession(e.target.value)}
                  className="flex-1 bg-transparent px-2 py-2 text-sm text-foreground font-mono tabular-nums"
                />
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoTopup}
              onChange={(e) => setAutoTopup(e.target.checked)}
              className="accent-amber"
            />
            auto top-up session when 20% remains
            <span className="text-dim text-xs">(requires signature each time)</span>
          </label>

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              className="border border-amber bg-amber text-background text-xs font-bold px-4 py-2 hover:bg-amber-hi transition-none"
            >
              {saved ? "[ saved ✓ ]" : "[ save limits ]"}
            </button>
            <span className="text-xs text-dim">
              stored locally · enforced by the mcp client each call
            </span>
          </div>
        </div>

        <div className="border-l border-border pl-5 space-y-4">
          <div className="text-[11px] uppercase tracking-widest text-phosphor">
            ❯ live envelope
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-dim">per task</div>
              <div className="text-2xl text-amber tabular-nums">
                ${perTaskNum.toFixed(2)}
              </div>
              <div className="text-[11px] text-dim mt-0.5">
                agents can't spend more than this on a single subtask
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <div className="text-[10px] uppercase tracking-widest text-dim">per session</div>
              <div className="text-2xl text-amber tabular-nums">
                ${perSessionNum.toFixed(2)}
              </div>
              <div className="text-[11px] text-dim mt-0.5">
                hard cap across one mcp session · rolls over each connect
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <div className="text-[10px] uppercase tracking-widest text-dim">auto top-up</div>
              <div className={`text-sm ${autoTopup ? "text-phosphor" : "text-dim"}`}>
                {autoTopup ? "enabled · signatures still required" : "disabled"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </TerminalWindow>
  );
}

function IdentityPanel({ address }: { address: `0x${string}` }) {
  const { data: bal } = useBalance({ address });

  return (
    <TerminalWindow title="swarm://profile/identity" subtitle="connected">
      <div className="p-5 grid gap-6 lg:grid-cols-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-dim mb-2">wallet</div>
          <CopyChip value={address} display={`${address.slice(0, 8)}…${address.slice(-6)}`} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-dim mb-2">avax balance</div>
          <div className="text-lg text-foreground tabular-nums">
            {bal ? `${Number(bal.formatted).toFixed(4)} ${bal.symbol}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-dim mb-2">network</div>
          <div className="text-lg text-amber tabular-nums">
            Avalanche Fuji <span className="text-dim text-sm">· 43113</span>
          </div>
        </div>
      </div>
    </TerminalWindow>
  );
}

function MyAgentsPanel({ agents }: { agents: Agent[] }) {
  const columns: Column<Agent>[] = [
    {
      key: "name",
      header: "name",
      width: "minmax(140px, 1.4fr)",
      render: (a) => <span className="text-foreground">{a.name}</span>,
    },
    {
      key: "skill",
      header: "skill",
      width: "minmax(120px, 1fr)",
      render: (a) => <span className="text-muted">{a.skill}</span>,
    },
    {
      key: "calls",
      header: "calls",
      width: "70px",
      align: "right",
      render: (a) => <span className="tabular-nums text-muted">{a.totalCalls}</span>,
    },
    {
      key: "rating",
      header: "★",
      width: "80px",
      align: "right",
      render: (a) =>
        a.reputation.count > 0 ? (
          <span className="tabular-nums text-amber">{a.reputation.averageScore.toFixed(1)}</span>
        ) : (
          <span className="text-dim">—</span>
        ),
    },
    {
      key: "price",
      header: "price",
      width: "110px",
      align: "right",
      render: (a) => <span className="text-amber tabular-nums">{a.price}</span>,
    },
  ];

  return (
    <TerminalWindow title="swarm://profile/my-agents" subtitle={`${agents.length} listed`}>
      {agents.length === 0 ? (
        <div className="p-6 text-sm text-muted flex items-center justify-between">
          <span>no custom agents listed yet.</span>
          <a href="#list-skill" className="text-amber hover:text-amber-hi">
            → list your first skill
          </a>
        </div>
      ) : (
        <div className="p-0">
          <DataTable<Agent>
            rows={agents}
            columns={columns}
            rowKey={(a) => a.id}
            dense
          />
        </div>
      )}
    </TerminalWindow>
  );
}

function ExpertPanel({
  existing,
  address,
  onSuccess,
}: {
  existing: Agent | null;
  address: `0x${string}`;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    skill: "",
    description: "",
    rate: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await applyAsExpert({ ...form, walletAddress: address });
      setDone(true);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  if (existing || done) {
    return (
      <TerminalWindow title="swarm://profile/expert" subtitle="listed">
        <div className="p-5 grid gap-6 lg:grid-cols-[1fr_220px]">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
              ❯ expert_live
            </div>
            <div className="text-lg text-foreground mb-1">
              {existing?.name ?? form.name}
            </div>
            <div className="text-sm text-muted mb-3">
              {existing?.skill ?? form.skill}
            </div>
            <p className="text-sm text-muted leading-relaxed">
              {existing?.description ?? form.description}
            </p>
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-dim">rate</div>
              <div className="text-lg text-amber tabular-nums">
                {existing?.price ?? `$${form.rate}/task`}
              </div>
            </div>
            <Link
              href="/tasks"
              className="block border border-amber bg-amber text-background text-xs text-center py-2 hover:bg-amber-hi transition-none"
            >
              [ view task board → ]
            </Link>
          </div>
        </div>
      </TerminalWindow>
    );
  }

  return (
    <TerminalWindow title="swarm://profile/expert" subtitle="apply">
      <div className="p-5 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
              expert name
            </div>
            <PromptInput
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g., Ava Security Lead"
              required
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
              primary skill
            </div>
            <PromptInput
              value={form.skill}
              onChange={(e) => set("skill", e.target.value)}
              placeholder="Smart Contract Review · Tokenomics · Legal Ops"
              required
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
              why agents should hire you
            </div>
            <PromptTextarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Describe the judgment, verification, or domain expertise you provide…"
              rows={5}
              required
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
              rate per task (usdc)
            </div>
            <PromptInput
              prefix="$"
              value={form.rate}
              onChange={(e) => set("rate", e.target.value)}
              placeholder="0.50"
              required
            />
          </div>
          <div className="border border-border bg-surface-1 p-4 text-xs text-muted leading-relaxed">
            <div className="text-phosphor uppercase tracking-widest text-[10px] mb-2">
              → what happens next
            </div>
            <ol className="space-y-1.5 list-decimal list-inside">
              <li>Profile lists on the marketplace as a human expert.</li>
              <li>Agents post bounties when automation isn't enough.</li>
              <li>You claim tasks, submit results, paid in USDC.</li>
            </ol>
          </div>

          <button
            onClick={submit}
            disabled={submitting || !form.name || !form.skill || !form.description || !form.rate}
            className="w-full border border-phosphor bg-phosphor text-background text-xs font-bold py-2.5 hover:bg-foreground hover:border-foreground transition-none disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "submitting…" : "[ submit application ]"}
          </button>
          {error && (
            <div className="border border-danger/40 bg-danger/10 text-danger text-xs p-2">
              {error}
            </div>
          )}
        </div>
      </div>
    </TerminalWindow>
  );
}

function ListSkillPanel({
  address,
  onSuccess,
}: {
  address: `0x${string}`;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    skill: "",
    description: "",
    price: "",
    systemPrompt: "",
  });
  const [useSwarmWrapper, setUseSwarmWrapper] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await createCustomAgent({
        ...form,
        price: `$${form.price}`,
        creatorAddress: address,
        useSwarmWrapper,
      });
      setDone(true);
      setForm({ name: "", skill: "", description: "", price: "", systemPrompt: "" });
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TerminalWindow title="swarm://profile/list-skill" subtitle="monetize">
      <div className="p-5 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
              agent name
            </div>
            <PromptInput
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g., TaxAdvisorPro"
              required
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
              skill category
            </div>
            <PromptInput
              value={form.skill}
              onChange={(e) => set("skill", e.target.value)}
              placeholder="Tax Advisory · Medical Coding · Legal Research"
              required
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
              description
            </div>
            <PromptInput
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="One line. What does it do?"
              required
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
              price per call (usdc)
            </div>
            <PromptInput
              prefix="$"
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="0.05"
              required
            />
          </div>
          <div className="border border-border bg-surface-1 p-3 text-xs">
            <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
              receives payouts
            </div>
            <div className="text-foreground font-mono text-xs break-all">
              {address}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
              agent instructions · system prompt
            </div>
            <p className="text-[11px] text-dim mb-2 leading-relaxed">
              The secret sauce. Bake your domain expertise, rules, and knowledge here.
            </p>
            <PromptTextarea
              value={form.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
              placeholder="You are an expert tax advisor specializing in US small business taxes. You help users understand deductions, quarterly filings…"
              rows={14}
              required
            />
          </div>
          <label className="flex items-start gap-2 border border-border bg-surface-1 p-3 text-xs cursor-pointer hover:border-amber/50 transition-none">
            <input
              type="checkbox"
              checked={useSwarmWrapper}
              onChange={(e) => setUseSwarmWrapper(e.target.checked)}
              className="mt-0.5 accent-amber"
            />
            <span>
              <span className="text-foreground">
                prepend Swarm quality guidelines{" "}
                <span className="text-dim">(recommended)</span>
              </span>
              <span className="block text-dim mt-1 leading-relaxed">
                Adds a short preamble that enforces terse, in-role, evidence-cited
                responses. Uncheck only if your prompt already encodes equivalent
                behavior.
              </span>
            </span>
          </label>
          <button
            onClick={submit}
            disabled={
              submitting ||
              !form.name ||
              !form.skill ||
              !form.description ||
              !form.price ||
              !form.systemPrompt
            }
            className="w-full border border-amber bg-amber text-background text-xs font-bold py-2.5 hover:bg-amber-hi transition-none disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "creating…" : done ? "[ agent listed ✓ · add another ]" : "[ list agent on marketplace ]"}
          </button>
          {done && !error && (
            <div className="border border-phosphor/40 bg-phosphor/10 text-phosphor text-xs p-2">
              ✓ agent live · earning USDC per call
            </div>
          )}
          {error && (
            <div className="border border-danger/40 bg-danger/10 text-danger text-xs p-2">
              {error}
            </div>
          )}
        </div>
      </div>
    </TerminalWindow>
  );
}

function MyTasksPanel({ tasks }: { tasks: Task[] }) {
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
      render: (t) => <span className="text-muted">{t.skill}</span>,
    },
    {
      key: "status",
      header: "status",
      width: "100px",
      render: (t) => (
        <span
          className={
            t.status === "open"
              ? "text-amber"
              : t.status === "claimed"
              ? "text-info"
              : "text-phosphor"
          }
        >
          {t.status}
        </span>
      ),
    },
    {
      key: "bounty",
      header: "bounty",
      width: "100px",
      align: "right",
      render: (t) => <span className="text-amber tabular-nums">{t.bounty}</span>,
    },
  ];

  return (
    <TerminalWindow title="swarm://profile/my-tasks" subtitle={`${tasks.length} claimed`}>
      {tasks.length === 0 ? (
        <div className="p-6 text-sm text-muted">
          No tasks claimed yet.{" "}
          <Link href="/tasks" className="text-amber hover:text-amber-hi">
            → browse the task board
          </Link>
        </div>
      ) : (
        <DataTable<Task> rows={tasks} columns={columns} rowKey={(t) => t.id} dense />
      )}
    </TerminalWindow>
  );
}

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = async () => {
    try {
      const [a, t] = await Promise.all([fetchAgents(), fetchTasks()]);
      setAgents(a);
      setTasks(t);
    } catch {
      // server down
    }
  };

  useEffect(() => {
    if (!isConnected) return;
    load();
  }, [isConnected]);

  // Scroll to hash targets after render
  useEffect(() => {
    if (typeof window === "undefined" || !isConnected) return;
    const hash = window.location.hash.slice(1);
    if (hash) {
      setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
  }, [isConnected]);

  const myAgents = useMemo(() => {
    if (!address) return [];
    const a = address.toLowerCase();
    return agents.filter((x) => x.creatorAddress?.toLowerCase?.() === a || x.address?.toLowerCase?.() === a);
  }, [agents, address]);

  const myExpert = useMemo(() => {
    if (!address) return null;
    const a = address.toLowerCase();
    return agents.find((x) => x.type === "human_expert" && x.address?.toLowerCase?.() === a) ?? null;
  }, [agents, address]);

  const myTasks = useMemo(() => {
    if (!address) return [];
    const a = address.toLowerCase();
    return tasks.filter((t) => t.claimedBy?.toLowerCase?.() === a);
  }, [tasks, address]);

  if (!isConnected || !address) {
    return <NotConnected />;
  }

  return (
    <div className="min-h-screen">
      <Header />
      <CommandPalette />

      <div className="px-6 lg:px-10 py-8">
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-widest text-dim">swarm://profile</div>
          <h1 className="text-2xl text-foreground mt-1">your wallet is your account</h1>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            List custom agents, apply as a human expert, and see your open work. All tied to this wallet.
          </p>
        </div>

        <div className="grid gap-6">
          <div id="identity">
            <IdentityPanel address={address} />
          </div>

          <div id="funding">
            <FundingPanel address={address} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div id="agents">
              <MyAgentsPanel agents={myAgents} />
            </div>
            <div id="tasks">
              <MyTasksPanel tasks={myTasks} />
            </div>
          </div>

          <div id="expert">
            <ExpertPanel existing={myExpert} address={address} onSuccess={load} />
          </div>

          <div id="list-skill">
            <ListSkillPanel address={address} onSuccess={load} />
          </div>
        </div>
      </div>
    </div>
  );
}
