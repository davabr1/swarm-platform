"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useChainId, useSignTypedData, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import TerminalWindow from "@/components/TerminalWindow";
import SubmittingLabel from "@/components/SubmittingLabel";

type Stage = "idle" | "signing" | "approving" | "awaiting-receipt" | "claiming" | "paired" | "error";

type PairConfig = { orchestrator: string; usdc: string; chainId: number };

const DOMAIN = { name: "Swarm", version: "1" } as const;
const PAIR_TYPES = {
  PairAuthorization: [
    { name: "code", type: "string" },
    { name: "address", type: "address" },
    { name: "budgetMicroUsd", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
    { name: "chainId", type: "uint256" },
  ],
} as const;

const USDC_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export default function PairPage() {
  return (
    <Suspense fallback={<Shell><div className="text-sm text-muted">loading…</div></Shell>}>
      <PairInner />
    </Suspense>
  );
}

function PairInner() {
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const validCode = /^pair_[A-Za-z0-9_-]{16,64}$/.test(code);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [budget, setBudget] = useState("5");
  const [expiryDays, setExpiryDays] = useState("30");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [pairConfig, setPairConfig] = useState<PairConfig | null>(null);
  const [signature, setSignature] = useState<`0x${string}` | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [approveHash, setApproveHash] = useState<`0x${string}` | null>(null);

  useEffect(() => {
    fetch("/api/pair/config")
      .then((r) => r.json())
      .then((c: PairConfig) => setPairConfig(c))
      .catch(() => setError("Could not load pair config"));
  }, []);

  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();
  const { isSuccess: receiptOk, isError: receiptErr } = useWaitForTransactionReceipt({
    hash: approveHash ?? undefined,
  });

  const budgetUsd = useMemo(() => parseFloat(budget || "0"), [budget]);
  const budgetValid = Number.isFinite(budgetUsd) && budgetUsd > 0 && budgetUsd <= 50;
  const expiryDaysNum = parseInt(expiryDays || "0", 10);
  const expiryValid = Number.isFinite(expiryDaysNum) && expiryDaysNum > 0 && expiryDaysNum <= 90;

  // Drive the claim POST once the approve tx confirms.
  useEffect(() => {
    if (stage !== "awaiting-receipt") return;
    if (receiptErr) {
      setError("USDC approve transaction failed on-chain");
      setStage("error");
      return;
    }
    if (!receiptOk) return;
    if (!signature || !address || !expiresAt) return;
    setStage("claiming");
    (async () => {
      try {
        const res = await fetch("/api/pair/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            address,
            budgetUsd,
            expiresAt,
            signature,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `Claim failed (${res.status})`);
        setStage("paired");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error claiming session");
        setStage("error");
      }
    })();
  }, [stage, receiptOk, receiptErr, signature, address, expiresAt, budgetUsd, code]);

  const authorize = async () => {
    if (!pairConfig || !address) return;
    if (!budgetValid || !expiryValid) {
      setError("Budget must be $0–$50 and expiry 1–90 days.");
      setStage("error");
      return;
    }
    if (chainId !== pairConfig.chainId) {
      setError(`Wrong network. Switch to Avalanche Fuji (chainId ${pairConfig.chainId}).`);
      setStage("error");
      return;
    }
    setError("");
    const exp = Math.floor(Date.now() / 1000) + expiryDaysNum * 24 * 60 * 60;
    const budgetMicroUsd = BigInt(Math.round(budgetUsd * 1_000_000));
    try {
      setStage("signing");
      const sig = await signTypedDataAsync({
        domain: { ...DOMAIN, chainId: pairConfig.chainId },
        types: PAIR_TYPES,
        primaryType: "PairAuthorization",
        message: {
          code,
          address,
          budgetMicroUsd,
          expiresAt: BigInt(exp),
          chainId: BigInt(pairConfig.chainId),
        },
      });
      setSignature(sig);
      setExpiresAt(exp);

      setStage("approving");
      const hash = await writeContractAsync({
        abi: USDC_ABI,
        address: pairConfig.usdc as `0x${string}`,
        functionName: "approve",
        args: [pairConfig.orchestrator as `0x${string}`, budgetMicroUsd],
      });
      setApproveHash(hash);
      setStage("awaiting-receipt");
    } catch (e) {
      setError(e instanceof Error ? e.message : "User rejected or unknown error");
      setStage("error");
    }
  };

  if (!validCode) {
    return (
      <Shell>
        <div className="text-sm text-danger">Invalid or missing pair code in URL.</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="w-full max-w-xl">
        <TerminalWindow title="swarm://pair" subtitle="one-time MCP authorization">
          <div className="p-6 space-y-5">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-dim mb-1">pair code</div>
              <div className="font-mono text-xs text-amber break-all">{code}</div>
              <div className="text-[10px] text-dim mt-2 leading-relaxed">
                Verify this matches the code your MCP printed to stderr. After authorizing, the MCP will automatically pick up the session on its next poll.
              </div>
            </div>

            {!isConnected || !address ? (
              <div className="flex flex-col items-center py-4 gap-3">
                <div className="text-sm text-muted">Connect the wallet you want to fund agent calls from.</div>
                <ConnectButton />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <div className="text-[10px] uppercase tracking-widest text-dim mb-2">budget · usdc</div>
                    <div className="flex items-baseline border border-border px-2 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value.replace(/[^0-9.]/g, ""))}
                        className="w-full bg-transparent text-amber tabular-nums outline-none border-0"
                      />
                      <span className="text-amber ml-1 text-xs">USDC</span>
                    </div>
                    <div className="text-[10px] text-dim mt-1">max 50 USDC. one approve tx.</div>
                  </label>
                  <label className="block">
                    <div className="text-[10px] uppercase tracking-widest text-dim mb-2">expires · days</div>
                    <div className="flex items-baseline border border-border px-2 py-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={expiryDays}
                        onChange={(e) => setExpiryDays(e.target.value.replace(/[^0-9]/g, ""))}
                        className="w-full bg-transparent text-foreground tabular-nums outline-none border-0"
                      />
                    </div>
                    <div className="text-[10px] text-dim mt-1">max 90. re-pair any time.</div>
                  </label>
                </div>

                <div className="border border-border p-3 text-[11px] text-dim leading-relaxed">
                  Authorizing will prompt two wallet actions:
                  <ol className="list-decimal ml-4 mt-1 space-y-1">
                    <li>One off-chain EIP-712 signature (free) — proves you authorized this session.</li>
                    <li>One USDC <code className="text-amber">approve</code> transaction (~0.001 AVAX) — the orchestrator can pull up to <span className="text-amber">{budget || "0"} USDC</span> on your behalf. You stay in full control; revoke any time from your profile page.</li>
                  </ol>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={authorize}
                    disabled={
                      !budgetValid ||
                      !expiryValid ||
                      stage === "signing" ||
                      stage === "approving" ||
                      stage === "awaiting-receipt" ||
                      stage === "claiming" ||
                      stage === "paired"
                    }
                    className="border border-amber bg-amber text-background text-xs font-bold px-4 py-2 hover:bg-amber-hi disabled:opacity-40 transition-none"
                  >
                    {stage === "signing" ? <SubmittingLabel text="sign typed data" /> : null}
                    {stage === "approving" ? <SubmittingLabel text="sign approve" /> : null}
                    {stage === "awaiting-receipt" ? <SubmittingLabel text="waiting for tx" /> : null}
                    {stage === "claiming" ? <SubmittingLabel text="claiming" /> : null}
                    {stage === "paired" ? "[ paired ✓ ]" : null}
                    {(stage === "idle" || stage === "error") ? "[ authorize MCP session ]" : null}
                  </button>
                  {approveHash && (
                    <a
                      className="text-[10px] text-dim hover:text-amber"
                      href={`https://testnet.snowtrace.io/tx/${approveHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      approve tx ↗
                    </a>
                  )}
                </div>

                {stage === "paired" && (
                  <div className="border border-phosphor p-3 text-xs text-phosphor">
                    ✓ Paired. Close this tab — the MCP will pick up the session within a couple of seconds.
                  </div>
                )}
                {error && <div className="text-xs text-danger break-words">{error}</div>}
              </>
            )}
          </div>
        </TerminalWindow>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Header />
      <CommandPalette />
      <div className="px-6 lg:px-10 py-12 flex items-start justify-center">{children}</div>
    </div>
  );
}
