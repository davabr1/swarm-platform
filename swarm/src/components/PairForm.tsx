"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import SubmittingLabel from "./SubmittingLabel";

export type PairStage = "idle" | "signing" | "claiming" | "paired" | "error";

export interface PairSuccess {
  sessionToken: string;
  address: string;
  label: string | null;
  expiresAt: string;
}

export interface PairFormProps {
  code: string;
  defaultLabel?: string;
  defaultExpiryDays?: string;
  onSuccess: (result: PairSuccess) => void;
  onCancel?: () => void;
  /** True for the /pair route (MCP flow — shows the pair code). False for the in-site modal. */
  showCodeHeader?: boolean;
}

type PairConfig = { chainId: number };

type ErrorKind = "rejected" | "network" | "code_used" | "disconnected" | "validation" | "other";

interface ClassifiedError {
  kind: ErrorKind;
  title: string;
  body: string;
  showRetry: boolean;
}

function classifyError(err: unknown): ClassifiedError {
  const anyErr = err as
    | { code?: number | string; shortMessage?: string; message?: string }
    | undefined;
  const raw =
    anyErr?.shortMessage ||
    anyErr?.message ||
    (err instanceof Error ? err.message : String(err ?? ""));
  const lower = raw.toLowerCase();
  const code = anyErr?.code;

  if (
    code === 4001 ||
    code === "ACTION_REJECTED" ||
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("rejected the request")
  ) {
    return {
      kind: "rejected",
      title: "You rejected the signature.",
      body: "Click authorize again to retry. Only one signature prompt — no gas, no approve transaction.",
      showRetry: true,
    };
  }
  if (
    raw === "Pair code already used" ||
    lower.includes("already used") ||
    lower.includes("already consumed") ||
    lower.includes("pair code already")
  ) {
    return {
      kind: "code_used",
      title: "This pair code has already been used.",
      body: "Retry to generate a fresh one.",
      showRetry: true,
    };
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("fetch")
  ) {
    return {
      kind: "network",
      title: "Couldn't reach the Swarm backend.",
      body: "Check your internet connection and retry. Your pair code is still valid.",
      showRetry: true,
    };
  }
  return {
    kind: "other",
    title: "Something went wrong.",
    body: raw || "Unknown error. Retry, or restart the pairing flow.",
    showRetry: true,
  };
}

export default function PairForm({
  code,
  defaultLabel = "",
  defaultExpiryDays = "30",
  onSuccess,
  onCancel,
  showCodeHeader = false,
}: PairFormProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [label, setLabel] = useState(defaultLabel);
  const [expiryDays, setExpiryDays] = useState(defaultExpiryDays);
  const [stage, setStage] = useState<PairStage>("idle");
  const [errorInfo, setErrorInfo] = useState<ClassifiedError | null>(null);
  const [pairConfig, setPairConfig] = useState<PairConfig | null>(null);

  useEffect(() => {
    fetch("/api/pair/config")
      .then((r) => r.json())
      .then((c: PairConfig) => setPairConfig(c))
      .catch((e) => {
        setErrorInfo(classifyError(e));
        setStage("error");
      });
  }, []);

  useEffect(() => {
    if (isConnected) return;
    if (stage === "idle" || stage === "paired" || stage === "error") return;
    setErrorInfo({
      kind: "disconnected",
      title: "Wallet disconnected mid-flow.",
      body: "Reconnect your wallet and click authorize again.",
      showRetry: true,
    });
    setStage("error");
  }, [isConnected, stage]);

  const resetToIdle = () => {
    setErrorInfo(null);
    setStage("idle");
  };

  const { signMessageAsync } = useSignMessage();

  const expiryDaysNum = parseInt(expiryDays || "0", 10);
  const expiryValid = Number.isFinite(expiryDaysNum) && expiryDaysNum > 0 && expiryDaysNum <= 365;

  const authorize = async () => {
    if (!pairConfig || !address) return;
    if (!expiryValid) {
      setErrorInfo({
        kind: "validation",
        title: "Invalid expiry.",
        body: "Expiry must be 1–365 days.",
        showRetry: true,
      });
      setStage("error");
      return;
    }
    if (chainId !== pairConfig.chainId) {
      setErrorInfo({
        kind: "validation",
        title: "Wrong network.",
        body: `Switch your wallet to Avalanche Fuji (chainId ${pairConfig.chainId}) and retry.`,
        showRetry: true,
      });
      setStage("error");
      return;
    }
    setErrorInfo(null);
    const issuedAt = Date.now();
    const normalized = address.toLowerCase();
    const message = `Swarm MCP pair: ${code}@${normalized}@${issuedAt}`;
    try {
      setStage("signing");
      const signature = await signMessageAsync({ message });

      setStage("claiming");
      const res = await fetch("/api/pair/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          address: normalized,
          issuedAt,
          signature,
          label: label.trim() || undefined,
          expiryDays: expiryDaysNum,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Claim failed (${res.status})`);
      if (!data?.sessionToken) throw new Error("Backend did not return sessionToken");
      setStage("paired");
      onSuccess({
        sessionToken: data.sessionToken,
        address: data.address,
        label: data.label ?? null,
        expiresAt: data.expiresAt,
      });
    } catch (e) {
      setErrorInfo(classifyError(e));
      setStage("error");
    }
  };

  return (
    <div className="space-y-5">
      {showCodeHeader && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-dim mb-1">pair code</div>
          <div className="font-mono text-xs text-amber break-all">{code}</div>
          <div className="text-[10px] text-dim mt-2 leading-relaxed">
            Verify this matches the code your MCP printed to stderr. The MCP picks up the session automatically.
          </div>
        </div>
      )}

      {!isConnected || !address ? (
        <div className="flex flex-col items-center py-4 gap-3">
          <div className="text-sm text-muted">Connect the wallet this MCP will spend from.</div>
          <ConnectButton />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <div className="text-[10px] uppercase tracking-widest text-dim mb-2">label · optional</div>
              <div className="flex items-baseline border border-border px-2 py-2">
                <input
                  type="text"
                  value={label}
                  placeholder="e.g. Claude Desktop"
                  onChange={(e) => setLabel(e.target.value.slice(0, 64))}
                  className="w-full bg-transparent text-foreground outline-none border-0"
                />
              </div>
              <div className="text-[10px] text-dim mt-1">helps you tell sessions apart.</div>
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
              <div className="text-[10px] text-dim mt-1">max 365. revoke any time.</div>
            </label>
          </div>

          <div className="border border-border p-3 text-[11px] text-dim leading-relaxed">
            Authorize this MCP client to spend from your <span className="text-amber">deposited balance</span>,
            bounded by your global <span className="text-amber">autonomous cap</span>. One off-chain
            signature — no gas, no approve transaction.
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={authorize}
              disabled={
                !expiryValid ||
                stage === "signing" ||
                stage === "claiming" ||
                stage === "paired"
              }
              className="border border-amber bg-amber text-background text-xs font-bold px-4 py-2 hover:bg-amber-hi disabled:opacity-40 transition-none"
            >
              {stage === "signing" ? <SubmittingLabel text="sign message" /> : null}
              {stage === "claiming" ? <SubmittingLabel text="claiming" /> : null}
              {stage === "paired" ? "[ paired ✓ ]" : null}
              {stage === "idle" || stage === "error" ? "[ authorize ]" : null}
            </button>
            {onCancel && stage !== "paired" && (
              <button
                onClick={onCancel}
                disabled={stage === "signing" || stage === "claiming"}
                className="text-[11px] text-dim hover:text-foreground disabled:opacity-40 bg-transparent border-0 cursor-pointer"
              >
                cancel
              </button>
            )}
          </div>

          {stage === "paired" && (
            <div className="border border-phosphor p-3 text-xs text-phosphor">
              ✓ Paired. {showCodeHeader ? "Close this tab — the MCP will pick up the session within a couple of seconds." : "You can now use agents with this wallet."}
            </div>
          )}
          {errorInfo && (
            <div className="border border-danger p-3 text-xs text-danger space-y-2">
              <div className="font-bold">✗ {errorInfo.title}</div>
              <div className="text-dim leading-relaxed">{errorInfo.body}</div>
              <div className="flex flex-wrap gap-2 pt-1">
                {errorInfo.showRetry && (
                  <button
                    onClick={resetToIdle}
                    className="border border-amber text-amber text-[11px] px-3 py-1 hover:bg-amber hover:text-background transition-none"
                  >
                    [ retry ]
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
