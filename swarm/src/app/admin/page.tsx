"use client";

import { useState } from "react";
import Header from "@/components/Header";
import TerminalWindow from "@/components/TerminalWindow";

interface WalletReadout {
  address: string;
  configured: boolean;
  usdcMicro: string;
  usdcUsd: string;
  avaxWei: string;
  avax: string;
}

interface StatusPayload {
  ok: true;
  treasury: WalletReadout;
  orchestrator: WalletReadout;
  platformAgent: WalletReadout;
  scan: {
    lastBlock: number | null;
    headBlock: number;
    gap: number | null;
  };
  usdcContract: string;
  rpc: string;
  chainId: number;
  checkedAt: string;
}

const SNOWTRACE_BASE = "https://testnet.snowtrace.io/address/";

function short(addr: string): string {
  if (!addr) return "—";
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StatusPayload | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.status === 401) {
        setError("invalid password");
        setData(null);
        return;
      }
      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: res.statusText }));
        setError(payload.error || `status ${res.status}`);
        setData(null);
        return;
      }
      const payload: StatusPayload = await res.json();
      setData(payload);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const lock = () => {
    setData(null);
    setError(null);
    setPassword("");
  };

  return (
    <div className="min-h-screen">
      <Header />
      <div className="px-6 lg:px-10 py-14 flex items-start justify-center">
        <div className="w-full max-w-2xl">
          <TerminalWindow
            title="swarm://admin"
            subtitle={data ? "unlocked" : "locked"}
          >
            {!data ? (
              <form onSubmit={submit} className="p-8">
                <div className="text-[10px] uppercase tracking-widest text-amber mb-4">
                  ❯ authentication_required
                </div>
                <div className="text-xl text-foreground mb-2">admin panel</div>
                <p className="text-sm text-muted leading-relaxed mb-6 max-w-md">
                  live fuji balances for the treasury, orchestrator, and
                  platform-agent wallets, plus the deposit scanner's current
                  lag behind chain head.
                </p>
                <label className="block text-[11px] uppercase tracking-widest text-dim mb-2">
                  admin password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  className="w-full bg-background border border-border-hi px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-amber"
                  placeholder="••••••••"
                />
                {error && (
                  <div className="mt-3 text-xs text-[#ff6a6a]">❯ {error}</div>
                )}
                <button
                  type="submit"
                  disabled={loading || !password}
                  className="mt-5 inline-flex items-center gap-2 border border-amber bg-amber px-4 py-2 text-xs font-bold text-background hover:bg-amber-hi disabled:opacity-50 disabled:cursor-not-allowed transition-none"
                >
                  {loading ? "[ checking… ]" : "[ unlock ]"}
                </button>
              </form>
            ) : (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-amber">
                      ❯ swarm_admin · fuji
                    </div>
                    <div className="text-[11px] text-dim mt-1">
                      checked {new Date(data.checkedAt).toLocaleTimeString()}
                    </div>
                  </div>
                  <button
                    onClick={lock}
                    className="text-[11px] uppercase tracking-widest text-dim hover:text-foreground"
                  >
                    [ lock ]
                  </button>
                </div>

                <WalletBlock
                  title="treasury · user-deposit custody"
                  wallet={data.treasury}
                  roleNote="holds user balances · signs outgoing payouts"
                />

                <div className="mt-4">
                  <WalletBlock
                    title="orchestrator · ERC-8004 signer"
                    wallet={data.orchestrator}
                    roleNote="signs registerAgent + giveFeedback · gas-only wallet"
                    expectUsdcZero
                  />
                </div>

                <div className="mt-4">
                  <WalletBlock
                    title="platform agent · shared revenue wallet"
                    wallet={data.platformAgent}
                    roleNote="collects per-call earnings for all platform-made agents · receive-only, no gas needed"
                    expectAvaxZero
                  />
                </div>

                <div className="mt-4 border border-border divide-y divide-border">
                  <Row label="last scanned block">
                    <span className="text-foreground font-mono">
                      {data.scan.lastBlock ?? "—"}
                    </span>
                  </Row>
                  <Row label="fuji head block">
                    <span className="text-foreground font-mono">{data.scan.headBlock}</span>
                  </Row>
                  <Row label="scan gap">
                    <span
                      className={
                        (data.scan.gap ?? 0) > 500
                          ? "text-[#ff6a6a] font-mono"
                          : "text-foreground font-mono"
                      }
                    >
                      {data.scan.gap ?? "—"} blocks
                    </span>
                  </Row>
                  <Row label="USDC contract">
                    <a
                      href={`${SNOWTRACE_BASE}${data.usdcContract}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted hover:text-amber font-mono"
                    >
                      {short(data.usdcContract)} ↗
                    </a>
                  </Row>
                  <Row label="chain">
                    <span className="text-muted font-mono">
                      fuji · chain {data.chainId}
                    </span>
                  </Row>
                </div>
              </div>
            )}
          </TerminalWindow>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center px-4 py-3 text-sm bg-background">
      <div className="text-[10px] uppercase tracking-widest text-dim">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function WalletBlock({
  title,
  wallet,
  roleNote,
  expectUsdcZero = false,
  expectAvaxZero = false,
}: {
  title: string;
  wallet: WalletReadout;
  roleNote: string;
  expectUsdcZero?: boolean;
  expectAvaxZero?: boolean;
}) {
  const avaxNum = Number(wallet.avax);
  const usdcNum = Number(wallet.usdcUsd);
  const avaxLow = wallet.configured && !expectAvaxZero && avaxNum < 0.05;
  const strayUsdc = expectUsdcZero && usdcNum > 0;
  const strayAvax = expectAvaxZero && avaxNum > 0;
  // Irrelevant rows are hidden when zero (clean display) and surfaced in
  // red if a balance accidentally lands there (misrouted funds detector).
  const hideUsdcRow = expectUsdcZero && !strayUsdc;
  const hideAvaxRow = expectAvaxZero && !strayAvax;

  return (
    <div className="border border-border bg-background">
      <div className="px-4 py-2 border-b border-border bg-surface-1 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-amber">❯ {title}</div>
        {!wallet.configured && (
          <span className="text-[10px] uppercase tracking-widest text-[#ff6a6a]">
            not configured
          </span>
        )}
      </div>
      <div className="divide-y divide-border">
        <Row label="address">
          {wallet.configured ? (
            <a
              href={`${SNOWTRACE_BASE}${wallet.address}`}
              target="_blank"
              rel="noreferrer"
              className="text-amber hover:text-amber-hi font-mono"
            >
              {short(wallet.address)} ↗
            </a>
          ) : (
            <span className="text-dim font-mono">—</span>
          )}
        </Row>
        {!hideUsdcRow && (
          <Row label="USDC balance">
            <span
              className={
                strayUsdc
                  ? "text-[#ff6a6a] font-mono"
                  : wallet.configured
                    ? "text-phosphor font-mono"
                    : "text-dim font-mono"
              }
            >
              {usdcNum.toLocaleString(undefined, {
                minimumFractionDigits: 6,
                maximumFractionDigits: 6,
              })}{" "}
              USDC
            </span>
            {strayUsdc && (
              <span className="text-[#ff6a6a] text-[11px] ml-2">
                ⚠ unexpected USDC — should be 0 on a gas-only wallet
              </span>
            )}
            {wallet.configured && (
              <span className="text-dim text-[11px] ml-2">
                ({wallet.usdcMicro} µUSDC)
              </span>
            )}
          </Row>
        )}
        {!hideAvaxRow && (
          <Row label="AVAX balance">
            <span
              className={
                strayAvax || avaxLow
                  ? "text-[#ff6a6a] font-mono"
                  : wallet.configured
                    ? "text-phosphor font-mono"
                    : "text-dim font-mono"
              }
            >
              {avaxNum.toFixed(6)} AVAX
            </span>
            {avaxLow && (
              <span className="text-[#ff6a6a] text-[11px] ml-2">
                ⚠ low · top up for gas
              </span>
            )}
            {strayAvax && (
              <span className="text-[#ff6a6a] text-[11px] ml-2">
                ⚠ unexpected AVAX — receive-only wallet, can be swept
              </span>
            )}
          </Row>
        )}
        <Row label="role">
          <span className="text-muted text-[11px] leading-relaxed">{roleNote}</span>
        </Row>
      </div>
    </div>
  );
}
