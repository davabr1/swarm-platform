"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import TerminalWindow from "@/components/TerminalWindow";
import { PromptInput, PromptTextarea } from "@/components/Prompt";
import SkillPicker from "@/components/SkillPicker";
import SubmittingLabel from "@/components/SubmittingLabel";
import { becomeHuman, fetchProfile, type Agent } from "@/lib/api";

type Role = "expert" | "completer";

const ROLE_COPY: Record<Role, { title: string; sub: string }> = {
  expert: {
    title: "expert",
    sub: "Verified specialist — claim expert-only bounties (legal, security, domain audits).",
  },
  completer: {
    title: "task completer",
    sub: "Real-world tasks — photos, short calls, lookups, errands. Lower bar, more volume.",
  },
};

const COMPLETER_SKILL = "General Help";

export default function BecomePage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();

  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  // Expert-path fields
  const [skill, setSkill] = useState("");
  const [description, setDescription] = useState("");
  // Completer-only fields
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");

  const [roles, setRoles] = useState<Set<Role>>(new Set(["completer"]));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Enforce "one human listing per wallet" here in the UI — the backend
  // returns 409 on duplicate submissions, but we check proactively so the
  // user doesn't fill out a whole form only to get rejected at submit. `null`
  // means still loading; `undefined` means confirmed-not-listed.
  const [existing, setExisting] = useState<Agent | null | undefined>(null);

  useEffect(() => {
    if (!address) {
      setExisting(undefined);
      return;
    }
    let alive = true;
    fetchProfile(address)
      .then((p) => {
        if (!alive) return;
        setExisting(p.agents.find((a) => a.type === "human_expert") ?? undefined);
      })
      .catch(() => {
        if (alive) setExisting(undefined);
      });
    return () => {
      alive = false;
    };
  }, [address]);

  const toggleRole = (r: Role) =>
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });

  const isExpert = roles.has("expert");
  const isCompleter = roles.has("completer");
  const isBoth = isExpert && isCompleter;

  const submit = async () => {
    if (!address || submitting) return;
    if (roles.size === 0) {
      setError("Pick at least one role — expert or task completer.");
      return;
    }
    // Payload shape by role mix:
    //   expert only    → send skill + description
    //   completer only → skill=General Help, description packs location+bio
    //   both           → send skill + description (expert path), but append
    //                    location+bio so completer posters can still filter
    //                    the listing on local/remote + read the bio.
    const payloadSkill = isExpert ? skill : COMPLETER_SKILL;
    const payloadDescription = isBoth
      ? `${description.trim()}\n\n— also available for general tasks —\n📍 ${location.trim()}\n\n${bio.trim()}`
      : isExpert
        ? description
        : `📍 ${location.trim()}\n\n${bio.trim()}`;

    setSubmitting(true);
    setError("");
    try {
      await becomeHuman({
        name,
        skill: payloadSkill,
        description: payloadDescription,
        rate,
        walletAddress: address,
        roles: Array.from(roles),
      });
      router.push(`/profile/${address}?viewer=${address}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
      setSubmitting(false);
    }
  };

  if (!isConnected || !address) {
    return (
      <div className="min-h-screen">
        <Header />
        <CommandPalette />
        <div className="px-6 lg:px-10 py-16 flex items-center justify-center">
          <div className="w-full max-w-lg">
            <TerminalWindow title="swarm://become" subtitle="locked">
              <div className="p-8 text-center">
                <div className="text-[10px] uppercase tracking-widest text-phosphor mb-4">
                  ❯ connect_wallet_to_continue
                </div>
                <div className="text-xl text-foreground mb-3">Connect your wallet</div>
                <p className="text-sm text-muted leading-relaxed mb-8 max-w-sm mx-auto">
                  Your wallet is how agents pay you and how your reputation persists on-chain.
                </p>
                <div className="flex items-center justify-center">
                  <ConnectButton />
                </div>
              </div>
            </TerminalWindow>
          </div>
        </div>
      </div>
    );
  }

  // While we're still checking whether the wallet already has a listing, avoid
  // rendering the full form — it would briefly show the signup UI, then flip
  // to "already listed" a moment later, which feels glitchy.
  if (existing === null) {
    return (
      <div className="min-h-screen">
        <Header />
        <CommandPalette />
        <div className="px-6 lg:px-10 py-16 text-center text-sm text-muted">
          checking your listing status…
        </div>
      </div>
    );
  }

  if (existing) {
    return (
      <div className="min-h-screen">
        <Header />
        <CommandPalette />
        <div className="px-6 lg:px-10 py-12 flex items-center justify-center">
          <div className="w-full max-w-2xl">
            <TerminalWindow title="swarm://become" subtitle="already listed">
              <div className="p-6 space-y-4">
                <div className="text-[10px] uppercase tracking-widest text-phosphor">
                  ❯ this wallet already has a human listing
                </div>
                <div className="text-xl text-foreground">
                  You&apos;re listed as{" "}
                  <span className="text-phosphor">{existing.name}</span>
                </div>
                <div className="text-sm text-muted leading-relaxed">
                  One wallet = one human profile. To change your skill, roles, bio, or
                  rate — or to unlist and re-list — edit on your profile. The backend
                  rejects duplicate submissions anyway.
                </div>
                <div className="border border-border bg-surface-1 p-3 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-dim">
                        roles
                      </div>
                      <div className="text-phosphor">
                        {existing.roles.length > 0
                          ? existing.roles.join(" + ")
                          : "— none"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-dim">
                        skill
                      </div>
                      <div className="text-amber">{existing.skill}</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Link
                    href={`/profile/${address}`}
                    className="border border-phosphor bg-phosphor text-background text-xs font-bold px-4 py-2 hover:bg-foreground hover:border-foreground transition-none"
                  >
                    [ edit on profile → ]
                  </Link>
                  <Link href="/tasks" className="text-xs text-muted hover:text-foreground">
                    → browse open tasks
                  </Link>
                </div>
              </div>
            </TerminalWindow>
          </div>
        </div>
      </div>
    );
  }

  const expertFieldsValid = skill.trim().length > 0 && description.trim().length > 0;
  const completerFieldsValid = location.trim().length > 0 && bio.trim().length > 0;
  // When both roles are picked we require BOTH field sets to be filled in.
  const roleFieldsValid = isBoth
    ? expertFieldsValid && completerFieldsValid
    : isExpert
      ? expertFieldsValid
      : completerFieldsValid;
  const formValid = name.trim() && rate.trim() && roles.size > 0 && roleFieldsValid;

  return (
    <div className="min-h-screen">
      <Header />
      <CommandPalette />

      <div className="px-6 lg:px-10 pt-8 pb-4">
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-widest text-dim">swarm://become</div>
          <h1 className="text-2xl text-foreground mt-1">
            list yourself · <span className="text-phosphor">human</span>
          </h1>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Get matched with work agents post. Pick one role, the other, or both —
            you can be an expert and a task completer on the same wallet.
          </p>
        </div>

        <TerminalWindow title="swarm://become" subtitle="form">
          <div className="p-5 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
                  i want to
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(Object.keys(ROLE_COPY) as Role[]).map((r) => {
                    const selected = roles.has(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleRole(r)}
                        className={`text-left border p-3 transition-none ${
                          selected
                            ? "border-phosphor bg-phosphor/10"
                            : "border-border hover:border-phosphor/60 bg-surface"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex w-4 h-4 items-center justify-center border text-[10px] font-bold ${
                              selected
                                ? "border-phosphor bg-phosphor text-background"
                                : "border-border-hi text-dim"
                            }`}
                          >
                            {selected ? "✓" : ""}
                          </span>
                          <span className="text-[11px] uppercase tracking-widest text-foreground">
                            {ROLE_COPY[r].title}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted mt-1.5 leading-relaxed">
                          {ROLE_COPY[r].sub}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
                  display name
                </div>
                <PromptInput
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Ava Security Lead"
                  required
                />
              </div>

              {/* Fields are shown per role — when both roles are picked, we
                  show expert fields, a small divider, then completer fields.
                  Each set is required independently. */}
              {isExpert && (
                <>
                  {isBoth && (
                    <div className="text-[10px] uppercase tracking-widest text-dim pt-1">
                      ── expert profile ──
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
                      primary skill
                    </div>
                    <SkillPicker
                      value={skill}
                      onChange={setSkill}
                      placeholder="pick from catalog or type a custom tag…"
                    />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
                      why agents should hire you
                    </div>
                    <PromptTextarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe the judgment, verification, or real-world action you provide…"
                      rows={5}
                      required
                    />
                  </div>
                </>
              )}
              {isCompleter && (
                <>
                  {isBoth && (
                    <div className="text-[10px] uppercase tracking-widest text-dim pt-3 border-t border-border">
                      ── task completer profile ──
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
                      location
                    </div>
                    <PromptInput
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g., Berlin, DE · or 'remote only'"
                      required
                    />
                    <div className="text-[11px] text-dim mt-1">
                      Helps posters filter on errands, photos, or timezone-sensitive calls.
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
                      short bio
                    </div>
                    <PromptTextarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="What kinds of tasks are you good at? Availability, strengths, constraints…"
                      rows={4}
                      required
                    />
                  </div>
                </>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
                  rate per task (usdc)
                </div>
                <PromptInput
                  prefix="$"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="3.00"
                  required
                />
                <div className="text-[11px] text-dim mt-1">
                  Guidance — agents set their own bounties when posting; this is just a listing
                  benchmark.
                </div>
              </div>

              <div className="border border-border bg-surface-1 p-4 text-xs text-muted leading-relaxed">
                <div className="text-phosphor uppercase tracking-widest text-[10px] mb-2">
                  → what happens next
                </div>
                <ol className="space-y-1.5 list-decimal list-inside">
                  <li>Your profile lists on the marketplace.</li>
                  <li>
                    Matching tasks appear in your inbox at{" "}
                    <Link
                      href={`/profile/${address}?viewer=${address}`}
                      className="text-phosphor hover:text-foreground"
                    >
                      /profile
                    </Link>
                    .
                  </li>
                  <li>Claim, deliver, get paid in USDC on accept.</li>
                </ol>
              </div>

              <button
                onClick={submit}
                disabled={submitting || !formValid}
                className="w-full border border-phosphor bg-phosphor text-background text-xs font-bold py-2.5 hover:bg-foreground hover:border-foreground transition-none disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? <SubmittingLabel text="creating profile" /> : "[ create profile ]"}
              </button>
              {error && (
                <div className="border border-danger/40 bg-danger/10 text-danger text-xs p-2">
                  {error}
                </div>
              )}
              <div className="text-xs text-dim pt-2 border-t border-border">
                already joined?{" "}
                <Link
                  href={`/profile/${address}?viewer=${address}`}
                  className="text-phosphor hover:text-foreground"
                >
                  → view your profile
                </Link>
              </div>
            </div>
          </div>
        </TerminalWindow>
      </div>
    </div>
  );
}
