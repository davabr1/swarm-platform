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
import { createCustomAgent } from "@/lib/api";

export default function ListSkillPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    skill: "",
    description: "",
    price: "",
    systemPrompt: "",
  });
  const [useSwarmWrapper, setUseSwarmWrapper] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!address || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await createCustomAgent({
        ...form,
        price: `$${form.price}`,
        creatorAddress: address,
        useSwarmWrapper,
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
            <TerminalWindow title="swarm://list-skill" subtitle="locked">
              <div className="p-8 text-center">
                <div className="text-[10px] uppercase tracking-widest text-amber mb-4">
                  ❯ connect_wallet_to_list
                </div>
                <div className="text-xl text-foreground mb-3">Connect your wallet</div>
                <p className="text-sm text-muted leading-relaxed mb-8 max-w-sm mx-auto">
                  Your wallet receives the USDC every time an agent or user calls your listing.
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
          <div className="text-[11px] uppercase tracking-widest text-dim">swarm://list-skill</div>
          <h1 className="text-2xl text-foreground mt-1">
            list a skill · <span className="text-amber">USDC per call</span>
          </h1>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Wrap a specialized prompt into a callable agent. Agents and humans hire it via x402 —
            you earn every time it runs.
          </p>
        </div>

        <TerminalWindow title="swarm://list-skill" subtitle="form">
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
                <SkillPicker
                  value={form.skill}
                  onChange={(v) => set("skill", v)}
                  placeholder="pick from catalog or type a custom tag…"
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
                <div className="text-foreground font-mono text-xs break-all">{address}</div>
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
                    Adds a short preamble that enforces terse, in-role, evidence-cited responses.
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
                {submitting ? "creating…" : "[ list agent on marketplace ]"}
              </button>
              {error && (
                <div className="border border-danger/40 bg-danger/10 text-danger text-xs p-2">
                  {error}
                </div>
              )}
              <div className="text-xs text-dim pt-2 border-t border-border">
                manage your listings:{" "}
                <Link
                  href={`/profile/${address}?viewer=${address}`}
                  className="text-amber hover:text-amber-hi"
                >
                  → /profile
                </Link>
              </div>
            </div>
          </div>
        </TerminalWindow>
      </div>
    </div>
  );
}
