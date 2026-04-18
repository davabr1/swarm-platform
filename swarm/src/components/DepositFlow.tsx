"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { announceDeposit, fetchBalance, fetchDepositConfig, type DepositConfig } from "@/lib/api";
import SubmittingLabel from "./SubmittingLabel";

export type DepositStage =
  | "idle"
  | "sending"
  | "awaiting-receipt"
  | "announcing"
  | "polling"
  | "credited"
  | "error";

// Minimal USDC.transfer ABI — inlined so we don't ship the Circle artifact
// into the client bundle.
const USDC_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

interface DepositFlowProps {
  onClose: () => void;
  onCredited: () => void;
}

function classify(err: unknown): { title: string; body: string } {
  const anyErr = err as { code?: number | string; shortMessage?: string; message?: string } | undefined;
  const raw =
    anyErr?.shortMessage ||
    anyErr?.message ||
    (err instanceof Error ? err.message : String(err ?? ""));
  const lower = raw.toLowerCase();
  if (
    anyErr?.code === 4001 ||
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("rejected the request")
  ) {
    return {
      title: "You rejected the transaction.",
      body: "Confirm the USDC transfer in your wallet to deposit.",
    };
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("load failed") ||
    lower.includes("networkerror")
  ) {
    return {
      title: "Couldn't reach Swarm.",
      body: "Check your connection. If the transfer already confirmed, the next poll will credit it.",
    };
  }
  return { title: "Deposit failed.", body: raw || "Unknown error. Retry or refresh." };
}

export default function DepositFlow({ onClose, onCredited }: DepositFlowProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const [cfg, setCfg] = useState<DepositConfig | null>(null);
  const [amount, setAmount] = useState("5");
  const [stage, setStage] = useState<DepositStage>("idle");
  const [hash, setHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [creditedUsd, setCreditedUsd] = useState<string | null>(null);
  // Baseline captured BEFORE the user signs the transfer. Must not be read
  // after the receipt — by then /api/balance's deposit scan may already
  // have credited this transfer, making the before/after compare equal and
  // leaving the button stuck on "announcing" until timeout.
  const baseBalanceRef = useRef<bigint | null>(null);
  const pollStartedAt = useRef<number | null>(null);

  const { writeContractAsync } = useWriteContract();
  const { isSuccess: receiptOk, isError: receiptErr } = useWaitForTransactionReceipt({
    hash: hash ?? undefined,
  });

  useEffect(() => {
    fetchDepositConfig()
      .then(setCfg)
      .catch((e) => setError(classify(e)));
  }, []);

  const amountNum = parseFloat(amount || "0");
  const amountValid = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= 10_000;
  const microAmount = amountValid ? BigInt(Math.round(amountNum * 1_000_000)) : BigInt(0);

  const reset = () => {
    setStage("idle");
    setHash(null);
    setError(null);
    setCreditedUsd(null);
    baseBalanceRef.current = null;
    pollStartedAt.current = null;
  };

  const send = async () => {
    if (!cfg || !address || !amountValid) return;
    if (chainId !== cfg.chainId) {
      setError({
        title: "Wrong network.",
        body: `Switch your wallet to Avalanche Fuji (chainId ${cfg.chainId}) and retry.`,
      });
      setStage("error");
      return;
    }
    setError(null);
    try {
      // Snapshot baseline before the user signs — after the receipt the
      // deposit poller may have already credited this transfer.
      const pre = await fetchBalance(address).catch(() => null);
      baseBalanceRef.current = pre ? BigInt(pre.balanceMicroUsd) : BigInt(0);
      setStage("sending");
      const txHash = await writeContractAsync({
        abi: USDC_TRANSFER_ABI,
        address: cfg.usdc as `0x${string}`,
        functionName: "transfer",
        args: [cfg.treasury as `0x${string}`, microAmount],
      });
      setHash(txHash);
      setStage("awaiting-receipt");
    } catch (e) {
      setError(classify(e));
      setStage("error");
    }
  };

  // Once the on-chain transfer confirms, announce + poll until balance reflects the credit.
  useEffect(() => {
    if (stage !== "awaiting-receipt" || !hash || !address) return;
    if (receiptErr) {
      setError({ title: "Transfer failed on-chain.", body: "Retry the deposit — no funds moved." });
      setStage("error");
      return;
    }
    if (!receiptOk) return;
    let cancelled = false;
    (async () => {
      try {
        setStage("announcing");
        // Baseline was captured in send() before the transfer was signed.
        // Fall back to 0 in the defensive case where it somehow wasn't set.
        const beforeBalance = baseBalanceRef.current ?? BigInt(0);
        await announceDeposit({ address, txHash: hash });
        if (cancelled) return;
        setStage("polling");
        pollStartedAt.current = Date.now();
        const deadline = Date.now() + 30_000;
        while (!cancelled && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 2000));
          if (cancelled) return;
          const now = await fetchBalance(address).catch(() => null);
          if (!now) continue;
          const nowBalance = BigInt(now.balanceMicroUsd);
          if (nowBalance > beforeBalance) {
            const deltaUsd = Number(nowBalance - beforeBalance) / 1_000_000;
            setCreditedUsd(deltaUsd.toFixed(2));
            setStage("credited");
            onCredited();
            return;
          }
        }
        if (!cancelled) {
          setError({
            title: "Credit is taking longer than expected.",
            body: "Your transfer confirmed on-chain. It should appear within a minute — leave the page open or refresh.",
          });
          setStage("error");
        }
      } catch (e) {
        if (!cancelled) {
          setError(classify(e));
          setStage("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stage, receiptOk, receiptErr, hash, address, onCredited]);

  const busy =
    stage === "sending" ||
    stage === "awaiting-receipt" ||
    stage === "announcing" ||
    stage === "polling";

  return (
    <div className="border border-amber p-4 space-y-4 bg-surface-1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-dim">swarm://deposit</div>
          <div className="text-sm text-foreground mt-1">
            deposit USDC to <span className="text-amber">swarm treasury</span>
          </div>
          <div className="text-[11px] text-dim mt-1 leading-relaxed max-w-md">
            One ERC-20 transfer on Fuji. Credits your deposited balance within ~10s after confirmation. No withdraw yet — deposit only what you plan to spend on agent calls.
          </div>
        </div>
        {!busy && (
          <button
            onClick={onClose}
            className="text-[11px] text-dim hover:text-foreground bg-transparent border-0 cursor-pointer"
          >
            close
          </button>
        )}
      </div>

      <label className="block">
        <div className="text-[10px] uppercase tracking-widest text-dim mb-2">amount · USDC</div>
        <div className="flex items-center border border-border px-3 py-2 max-w-xs">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            disabled={busy || stage === "credited"}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="flex-1 bg-transparent text-amber tabular-nums outline-none border-0"
          />
          <span className="text-amber text-xs ml-2">USDC</span>
        </div>
        {cfg && (
          <div className="text-[10px] text-dim mt-1 font-mono break-all">
            → treasury {cfg.treasury.slice(0, 8)}…{cfg.treasury.slice(-6)}
          </div>
        )}
      </label>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={send}
          disabled={!cfg || !amountValid || busy || stage === "credited"}
          className="border border-amber bg-amber text-background text-xs font-bold px-4 py-2 hover:bg-amber-hi disabled:opacity-40 transition-none"
        >
          {stage === "sending" && <SubmittingLabel text="sign transfer" />}
          {stage === "awaiting-receipt" && <SubmittingLabel text="waiting for block" />}
          {stage === "announcing" && <SubmittingLabel text="announcing" />}
          {stage === "polling" && <SubmittingLabel text="crediting" />}
          {stage === "credited" && "[ credited ✓ ]"}
          {(stage === "idle" || stage === "error") && "[ deposit ]"}
        </button>
        {stage === "error" && (
          <button
            onClick={reset}
            className="border border-amber text-amber text-[11px] px-3 py-1 hover:bg-amber hover:text-background transition-none"
          >
            [ retry ]
          </button>
        )}
      </div>

      {stage === "credited" && creditedUsd && (
        <div className="border border-phosphor p-3 text-xs text-phosphor">
          ✓ Credited {creditedUsd} USDC to your swarm balance.
        </div>
      )}
      {error && (
        <div className="border border-danger p-3 text-xs text-danger space-y-1">
          <div className="font-bold">✗ {error.title}</div>
          <div className="text-dim leading-relaxed">{error.body}</div>
        </div>
      )}
    </div>
  );
}
