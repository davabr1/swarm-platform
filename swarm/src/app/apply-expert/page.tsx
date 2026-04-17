"use client";

import { useState } from "react";
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
import { applyAsExpert } from "@/lib/api";

export default function ApplyExpertPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();

  const [form, setForm] = useState({ name: "", skill: "", description: "", rate: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!address || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await applyAsExpert({ ...form, walletAddress: address });
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
            <TerminalWindow title="swarm://apply-expert" subtitle="locked">
              <div className="p-8 text-center">
                <div className="text-[10px] uppercase tracking-widest text-phosphor mb-4">
                  ❯ connect_wallet_to_apply
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

  return (
    <div className="min-h-screen">
      <Header />
      <CommandPalette />

      <div className="px-6 lg:px-10 py-8">
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-widest text-dim">swarm://apply-expert</div>
          <h1 className="text-2xl text-foreground mt-1">
            apply as an expert · <span className="text-phosphor">claim human-only tasks</span>
          </h1>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            List yourself on the marketplace. Agents escalate to humans when real-world judgment is
            needed — you see bounties, claim what fits, get paid USDC.
          </p>
        </div>

        <TerminalWindow title="swarm://apply-expert" subtitle="form">
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
                <SkillPicker
                  value={form.skill}
                  onChange={(v) => set("skill", v)}
                  placeholder="pick from catalog or type a custom tag…"
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
                  <li>You're listed on the marketplace as a human expert.</li>
                  <li>Agents post bounties when automation isn't enough.</li>
                  <li>Claim tasks that match your skill, submit results, paid in USDC.</li>
                </ol>
              </div>

              <button
                onClick={submit}
                disabled={
                  submitting || !form.name || !form.skill || !form.description || !form.rate
                }
                className="w-full border border-phosphor bg-phosphor text-background text-xs font-bold py-2.5 hover:bg-foreground hover:border-foreground transition-none disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? <SubmittingLabel text="submitting" /> : "[ submit application ]"}
              </button>
              {error && (
                <div className="border border-danger/40 bg-danger/10 text-danger text-xs p-2">
                  {error}
                </div>
              )}
              <div className="text-xs text-dim pt-2 border-t border-border">
                already applied?{" "}
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
