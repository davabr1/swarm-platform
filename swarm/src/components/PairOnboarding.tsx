"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useBalance, useSignMessage } from "wagmi";
import {
  fetchBalance,
  fetchDepositConfig,
  setAutonomousCap,
  type Balance,
  type DepositConfig,
} from "@/lib/api";
import DepositFlow from "./DepositFlow";
import SubmittingLabel from "./SubmittingLabel";

const FAUCET_URL = "https://faucet.circle.com/";

interface Props {
  address: string;
}

// Rendered beneath the ✓ Paired confirmation on /pair. If the paired wallet
// already has a deposited balance, renders nothing — they're "set up on the
// website" and the MCP is good to go. Otherwise walks the fresh user through
// the minimal onboarding: get test USDC → deposit → optional allowance.
export default function PairOnboarding({ address }: Props) {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [cfg, setCfg] = useState<DepositConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeposit, setShowDeposit] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);

  const { data: walletUsdc } = useBalance({
    address: address as `0x${string}`,
    token: cfg?.usdc as `0x${string}` | undefined,
    chainId: cfg?.chainId,
    query: { enabled: !!cfg?.usdc, refetchInterval: 15_000 },
  });

  const reload = async () => {
    try {
      const b = await fetchBalance(address);
      setBalance(b);
    } catch {
      // leave stale; polling will retry
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [b, c] = await Promise.all([fetchBalance(address), fetchDepositConfig()]);
        if (cancelled) return;
        setBalance(b);
        setCfg(c);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (loading) {
    return (
      <div className="mt-6 text-[11px] text-dim">checking your setup…</div>
    );
  }

  const depositedMicro = balance ? BigInt(balance.balanceMicroUsd) : BigInt(0);
  const alreadySetUp = depositedMicro > BigInt(0);

  if (alreadySetUp) return null;

  const walletUsdcMicro = walletUsdc?.value ?? BigInt(0);
  const needsFaucet = walletUsdcMicro === BigInt(0);
  const capSet = !!balance?.autonomousCapSet;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setAddrCopied(true);
      setTimeout(() => setAddrCopied(false), 1200);
    } catch {
      // clipboard denied — user can select manually
    }
  };

  return (
    <div className="mt-8 border border-border bg-surface">
      <div className="px-5 py-3 border-b border-border">
        <div className="text-[10px] uppercase tracking-widest text-dim">next · finish onboarding</div>
        <div className="text-sm text-foreground mt-1">
          Your wallet has <span className="text-amber">0 USDC deposited</span>. A couple more steps and your MCP client can spend.
        </div>
      </div>

      <ol className="divide-y divide-border">
        {needsFaucet && (
          <OnboardingRow
            index="01"
            title="Get test USDC"
            body="Circle drops 20 USDC per request on Fuji. Paste your paired wallet below."
          >
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={FAUCET_URL}
                target="_blank"
                rel="noreferrer"
                className="border border-amber text-amber text-[11px] px-3 py-1 hover:bg-amber hover:text-background transition-none"
              >
                [ open faucet ↗ ]
              </a>
              <button
                onClick={copyAddress}
                className="border border-border text-dim text-[11px] px-3 py-1 hover:border-foreground hover:text-foreground transition-none bg-transparent cursor-pointer"
              >
                {addrCopied ? "[ copied ✓ ]" : "[ copy address ]"}
              </button>
              <span className="text-[10px] text-dim font-mono break-all">
                {address}
              </span>
            </div>
            <div className="text-[10px] text-dim mt-2">
              Pick <span className="text-foreground">Avalanche Fuji</span> in the faucet&apos;s network dropdown — wrong-network is the #1 reason drops don&apos;t show up.
            </div>
          </OnboardingRow>
        )}

        <OnboardingRow
          index={needsFaucet ? "02" : "01"}
          title="Deposit to the Swarm treasury"
          body="One USDC.transfer on Fuji. Credits your deposited balance in ~10s; agents spend from it per call."
        >
          {!showDeposit ? (
            <button
              onClick={() => setShowDeposit(true)}
              className="border border-amber bg-amber text-background text-xs font-bold px-4 py-2 hover:bg-amber-hi transition-none cursor-pointer"
            >
              [ deposit USDC ]
            </button>
          ) : (
            <DepositFlow
              onClose={() => setShowDeposit(false)}
              onCredited={() => {
                reload();
              }}
            />
          )}
        </OnboardingRow>

        {!capSet && (
          <OnboardingRow
            index={needsFaucet ? "03" : "02"}
            title="Optional · cap autonomous spend"
            body="Leave blank and paired MCP clients can spend up to your full deposited balance. Set a cap to bound a single run."
          >
            <AllowanceInline address={address} onSaved={reload} />
          </OnboardingRow>
        )}
      </ol>

      <div className="px-5 py-3 border-t border-border text-[10px] text-dim">
        You can always change any of this later on{" "}
        <Link href="/profile" className="text-foreground hover:text-amber">
          /profile
        </Link>
        .
      </div>
    </div>
  );
}

function OnboardingRow({
  index,
  title,
  body,
  children,
}: {
  index: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <li className="px-5 py-4">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-[10px] uppercase tracking-widest text-dim tabular-nums">{index}</span>
        <span className="text-[13px] text-foreground">{title}</span>
      </div>
      <div className="text-[11px] text-dim leading-relaxed mb-3 max-w-xl">{body}</div>
      {children}
    </li>
  );
}

function AllowanceInline({ address, onSaved }: { address: string; onSaved: () => void }) {
  const { signMessageAsync } = useSignMessage();
  const [cap, setCap] = useState("");
  const [stage, setStage] = useState<"idle" | "signing" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  const capNum = parseFloat(cap || "0");
  const valid = Number.isFinite(capNum) && capNum > 0 && capNum <= 10_000;
  const busy = stage === "signing" || stage === "saving";

  const save = async () => {
    if (!valid) return;
    setErr(null);
    try {
      const issuedAt = Date.now();
      const normalized = address.toLowerCase();
      const message = `Swarm autonomous allowance set: ${normalized}@${capNum}@${issuedAt}`;
      setStage("signing");
      const signature = await signMessageAsync({ message });
      setStage("saving");
      await setAutonomousCap({
        address: normalized,
        autonomousCapUsd: capNum,
        issuedAt,
        signature,
      });
      setStage("saved");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed to save allowance");
      setStage("error");
    }
  };

  if (stage === "saved") {
    return (
      <div className="text-[11px] text-phosphor">
        ✓ Allowance set to {capNum} USDC.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center border border-border px-3 py-2">
        <input
          type="text"
          inputMode="decimal"
          value={cap}
          disabled={busy}
          placeholder="e.g. 10"
          onChange={(e) => setCap(e.target.value.replace(/[^0-9.]/g, ""))}
          className="w-20 bg-transparent text-amber tabular-nums outline-none border-0 placeholder:text-dim"
        />
        <span className="text-amber text-xs ml-2">USDC</span>
      </div>
      <button
        onClick={save}
        disabled={!valid || busy}
        className="border border-amber text-amber text-[11px] px-3 py-1 hover:bg-amber hover:text-background disabled:opacity-40 transition-none bg-transparent cursor-pointer"
      >
        {stage === "signing" ? <SubmittingLabel text="sign" /> : null}
        {stage === "saving" ? <SubmittingLabel text="saving" /> : null}
        {stage === "idle" || stage === "error" ? "[ set allowance ]" : null}
      </button>
      <span className="text-[10px] text-dim">skip to leave uncapped</span>
      {err && <div className="text-[10px] text-danger w-full">✗ {err}</div>}
    </div>
  );
}
