"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSignMessage } from "wagmi";
import TerminalWindow from "./TerminalWindow";
import SubmittingLabel from "./SubmittingLabel";
import Link from "next/link";
import DepositFlow from "./DepositFlow";
import { useWalletBalances } from "@/lib/useWalletBalances";
import {
  fetchBalance,
  resetAutonomousCap,
  setAutonomousCap,
  type Balance,
} from "@/lib/api";

type McpSessionRow = {
  id: string;
  label: string | null;
  expiresAt: string;
  createdAt: string;
  callsCount: number;
};

function fmtUsd(microUsd: string | bigint): string {
  const n = typeof microUsd === "bigint" ? microUsd : BigInt(microUsd);
  return (Number(n) / 1_000_000).toFixed(2);
}

function timeAgo(iso: string): string {
  const ts = new Date(iso).getTime();
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function BalanceAutonomousAccessPanel({
  address,
  isSelf,
}: {
  address: string;
  isSelf: boolean;
}) {
  const normalized = (address.startsWith("0x") ? address : `0x${address}`) as `0x${string}`;
  const { usdc } = useWalletBalances(normalized);
  const { signMessageAsync } = useSignMessage();

  const [balance, setBalance] = useState<Balance | null>(null);
  const [balanceErr, setBalanceErr] = useState("");
  const [depositOpen, setDepositOpen] = useState(false);

  const loadBalance = useCallback(() => {
    fetchBalance(address)
      .then(setBalance)
      .catch(() => setBalanceErr("Could not load balance"));
  }, [address]);

  useEffect(() => {
    loadBalance();
    const iv = setInterval(loadBalance, 15_000);
    return () => clearInterval(iv);
  }, [loadBalance]);

  const capSet = !!(balance && !balance.usingDefaultCap);
  const capUsd = capSet ? fmtUsd(balance!.autonomousCapMicroUsd) : "—";
  const spentUsd = balance ? fmtUsd(balance.autonomousSpentMicroUsd) : "—";
  // Effective spendable = min(cap - used, deposited balance). Showing the
  // raw cap as "remaining" implies you can spend that much even when your
  // deposited balance is smaller, which is wrong — the ledger blocks on
  // whichever limit hits first.
  const remainingUsd = (() => {
    if (!balance) return "—";
    const deposited = Number(balance.balanceMicroUsd) / 1_000_000;
    if (!capSet) return deposited.toFixed(2);
    const capLeft = Math.max(
      0,
      Number(balance.autonomousCapMicroUsd) / 1_000_000 -
        Number(balance.autonomousSpentMicroUsd) / 1_000_000,
    );
    return Math.min(capLeft, deposited).toFixed(2);
  })();

  // Cap editor state
  const [capInput, setCapInput] = useState<string>("");
  const [capSaving, setCapSaving] = useState(false);
  const [capResetting, setCapResetting] = useState(false);
  const [capErr, setCapErr] = useState("");
  const [capSaved, setCapSaved] = useState(false);
  const capInputInitRef = useRef(false);

  useEffect(() => {
    // Prefill the cap editor ONCE — with the stored cap if the user has set
    // one, otherwise leave it empty so the placeholder shows and the user
    // types a fresh value. Without the once-guard this effect snapped the
    // input back to the stored cap every time the user erased a digit.
    if (capInputInitRef.current || !balance) return;
    capInputInitRef.current = true;
    if (!balance.usingDefaultCap) {
      setCapInput(fmtUsd(balance.autonomousCapMicroUsd));
    }
  }, [balance]);

  const saveCap = async () => {
    const num = parseFloat(capInput || "0");
    if (!Number.isFinite(num) || num < 0 || num > 10_000) {
      setCapErr("Cap must be between 0 and 10000 USDC");
      return;
    }
    setCapErr("");
    setCapSaving(true);
    try {
      const issuedAt = Date.now();
      const message = `Swarm autonomous allowance set: ${address.toLowerCase()}@${num}@${issuedAt}`;
      const signature = await signMessageAsync({ message });
      await setAutonomousCap({
        address: address.toLowerCase(),
        autonomousCapUsd: num,
        issuedAt,
        signature,
      });
      setCapSaved(true);
      setTimeout(() => setCapSaved(false), 1500);
      loadBalance();
    } catch (e) {
      setCapErr(e instanceof Error ? e.message : "Failed to save cap");
    } finally {
      setCapSaving(false);
    }
  };

  const resetUsage = async () => {
    setCapErr("");
    setCapResetting(true);
    try {
      const issuedAt = Date.now();
      const message = `Swarm autonomous allowance reset: ${address.toLowerCase()}@${issuedAt}`;
      const signature = await signMessageAsync({ message });
      await resetAutonomousCap({ address: address.toLowerCase(), issuedAt, signature });
      loadBalance();
    } catch (e) {
      setCapErr(e instanceof Error ? e.message : "Failed to reset usage");
    } finally {
      setCapResetting(false);
    }
  };

  return (
    <>
      <TerminalWindow
        title="swarm://profile/balance"
        subtitle={isSelf ? "deposited balance · autonomous access" : "deposited balance · fuji"}
        dots={false}
      >
        <div className="p-5 space-y-5">
          {/* Row 1: deposited balance */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-dim mb-2">
                deposited balance
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl text-phosphor tabular-nums">
                  {balance ? fmtUsd(balance.balanceMicroUsd) : "—"}
                </span>
                <span className="text-xs text-dim">USDC</span>
              </div>
              <div className="text-[10px] text-dim mt-2 leading-relaxed">
                on-chain wallet: {usdc.formatted} USDC{usdc.loading ? " · syncing" : ""}
              </div>
              {isSelf && !usdc.loading && usdc.formatted === "0.00" && (
                <div className="text-[11px] text-amber mt-2 leading-relaxed">
                  no Fuji USDC in your wallet —{" "}
                  <a
                    href="https://faucet.circle.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-amber-hi"
                  >
                    grab some from the Circle faucet
                  </a>
                  {" "}(choose <span className="text-foreground">Avalanche Fuji</span>).
                </div>
              )}
              {balanceErr && <div className="text-[11px] text-danger mt-2">{balanceErr}</div>}
            </div>
            {isSelf && !depositOpen && (
              <button
                onClick={() => setDepositOpen(true)}
                className="border border-phosphor bg-phosphor text-background text-xs font-bold px-4 py-2 hover:bg-foreground hover:border-foreground transition-none"
              >
                [ deposit ]
              </button>
            )}
          </div>

          {isSelf && depositOpen && (
            <DepositFlow
              onClose={() => setDepositOpen(false)}
              onCredited={() => {
                loadBalance();
              }}
            />
          )}

          {/* Row 2: autonomous cap */}
          {isSelf && (
            <div className="pt-4 border-t border-border">
              <div className="text-[10px] uppercase tracking-widest text-dim mb-2">
                autonomous allowance
              </div>
              <div className="text-[11px] text-dim mb-3 leading-relaxed max-w-2xl">
                Optional global ceiling on what MCP-paired agents can autonomously spend from your
                deposited balance. Leave it blank to let MCP agents spend up to your full deposited
                balance. Manual marketplace calls are never subject to this allowance.
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="block">
                  <div className="flex items-center border border-border px-3 py-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={capInput}
                      placeholder="no limit"
                      onChange={(e) => setCapInput(e.target.value.replace(/[^0-9.]/g, ""))}
                      className="w-24 bg-transparent text-amber tabular-nums outline-none border-0 placeholder:text-dim/50"
                    />
                    <span className="text-amber ml-2 text-xs">USDC</span>
                  </div>
                </label>
                <button
                  onClick={saveCap}
                  disabled={capSaving || capResetting}
                  className="border border-amber bg-amber text-background text-xs font-bold px-4 py-2 hover:bg-amber-hi disabled:opacity-40 transition-none"
                >
                  {capSaved ? "[ saved ✓ ]" : capSaving ? <SubmittingLabel text="signing" /> : "[ save allowance ]"}
                </button>
                <button
                  onClick={resetUsage}
                  disabled={capSaving || capResetting}
                  title="Zeros the running counter of what MCP agents have spent this allowance period. Doesn't change the allowance itself."
                  className="border border-dim text-dim text-xs px-3 py-2 hover:border-muted hover:text-muted disabled:opacity-40 transition-none"
                >
                  {capResetting ? <SubmittingLabel text="resetting" /> : "[ reset limit ]"}
                </button>
              </div>
              <div className="text-[11px] text-dim mt-2 tabular-nums">
                <span className="text-amber">{capUsd}</span> allowance ·{" "}
                <span className="text-foreground">{spentUsd}</span> used ·{" "}
                <span className="text-phosphor">{remainingUsd}</span> remaining
              </div>
              {capErr && <div className="text-[11px] text-danger mt-2">{capErr}</div>}
            </div>
          )}

          {/* Row 3: MCP sessions */}
          {isSelf && <McpSessionsRow address={address} />}
        </div>
      </TerminalWindow>
    </>
  );
}

function McpSessionsRow({ address }: { address: string }) {
  const [rows, setRows] = useState<McpSessionRow[] | null>(null);
  const [err, setErr] = useState("");
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const { signMessageAsync } = useSignMessage();

  const load = useCallback(() => {
    fetch(`/api/profile/${address}/sessions`)
      .then((r) => r.json())
      .then((d: { sessions: McpSessionRow[] }) => setRows(d.sessions ?? []))
      .catch(() => setErr("Could not load sessions"));
  }, [address]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 15_000);
    return () => clearInterval(iv);
  }, [load]);

  const revoke = async (sessionId: string) => {
    setErr("");
    setRevokingId(sessionId);
    try {
      const issuedAt = Date.now();
      const message = `Swarm session revoke: ${sessionId}@${issuedAt}`;
      const signature = await signMessageAsync({ message });
      const res = await fetch("/api/session/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, issuedAt, signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Revoke failed");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setRevokingId(null);
    }
  };

  const anyActive = rows && rows.length > 0;

  return (
    <div className="pt-4 border-t border-border">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-dim">paired MCP clients</div>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className={`inline-block w-2 h-2 dot-pulse ${anyActive ? "bg-phosphor" : "bg-dim"}`}
            />
            <span className={`text-sm ${anyActive ? "text-phosphor" : "text-dim"}`}>
              {anyActive
                ? `${rows!.length} agent${rows!.length === 1 ? "" : "s"} can autonomously spend from your balance`
                : "no agent connected — pair one to let your MCP client spend autonomously"}
            </span>
          </div>
        </div>
        <Link
          href="/configure"
          className="border border-amber text-amber text-xs px-3 py-2 hover:bg-amber hover:text-background transition-none"
        >
          [ pair a new client ]
        </Link>
      </div>
      {err && <div className="text-[11px] text-danger mb-2">{err}</div>}
      {!rows ? (
        <div className="text-xs text-muted">loading sessions…</div>
      ) : rows.length === 0 ? null : (
        <div className="divide-y divide-border">
          {rows.map((s) => {
            const expiresMs = new Date(s.expiresAt).getTime();
            const daysLeft = Math.max(0, Math.ceil((expiresMs - Date.now()) / (24 * 60 * 60 * 1000)));
            return (
              <div key={s.id} className="py-2.5 flex items-center gap-3 text-xs">
                <span className="flex-1 min-w-0">
                  <span className="text-foreground truncate block">
                    {s.label ?? <span className="text-dim">unlabeled</span>}
                  </span>
                  <span className="text-[10px] text-dim font-mono truncate block">
                    {s.id} · paired {timeAgo(s.createdAt)} ago · {daysLeft}d left
                  </span>
                </span>
                <span className="text-dim text-[11px] tabular-nums shrink-0">
                  {s.callsCount} calls
                </span>
                <button
                  onClick={() => revoke(s.id)}
                  disabled={revokingId === s.id}
                  className="shrink-0 border border-dim text-dim text-xs px-3 py-1 hover:border-muted hover:text-muted disabled:opacity-40 transition-none"
                >
                  {revokingId === s.id ? <SubmittingLabel text="revoking" /> : "[ revoke ]"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
