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
  headBlock: number;
  usdcContract: string;
  rpc: string;
  chainId: number;
  checkedAt: string;
}

interface TxRow {
  id: string;
  walletAddress: string;
  kind: string;
  deltaMicroUsd: string;
  grossMicroUsd: string;
  description: string | null;
  refType: string | null;
  refId: string | null;
  txHash: string | null;
  blockNumber: number | null;
  status: string;
  createdAt: string;
}

interface GlacierTx {
  txHash: string;
  blockTimestamp: number | null;
  from: string | null;
  to: string | null;
  value: string;
  method: string | null;
  status: string | null;
}

interface HealthPayload {
  ok: true;
  checkedAt: string;
  treasury: WalletReadout;
  settles: TxRow[];
  fanouts: TxRow[];
  failedFanoutCount: number;
  glacier: {
    source: string;
    transactions: GlacierTx[];
    error: string | null;
  };
  env: {
    rpc: string;
    rpcSource: string;
    chainId: number;
    caip2: string;
    usdcContract: string;
    facilitatorMode: string;
    platformPayoutAddress: string;
  };
}

const SNOWTRACE_BASE = "https://testnet.snowtrace.io/address/";
const SNOWTRACE_TX = "https://testnet.snowtrace.io/tx/";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [savedPassword, setSavedPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StatusPayload | null>(null);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const [statusRes, healthRes] = await Promise.all([
        fetch("/api/admin/status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password }),
        }),
        fetch("/api/admin/health", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password }),
        }),
      ]);
      if (statusRes.status === 401 || healthRes.status === 401) {
        setError("invalid password");
        setData(null);
        setHealth(null);
        return;
      }
      if (!statusRes.ok) {
        const payload = await statusRes
          .json()
          .catch(() => ({ error: statusRes.statusText }));
        setError(payload.error || `status ${statusRes.status}`);
        setData(null);
        setHealth(null);
        return;
      }
      const statusPayload: StatusPayload = await statusRes.json();
      setData(statusPayload);
      if (healthRes.ok) {
        const healthPayload: HealthPayload = await healthRes.json();
        setHealth(healthPayload);
      } else {
        setHealth(null);
      }
      setSavedPassword(password);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  const retryFanout = async (transactionId: string) => {
    if (!savedPassword) return;
    setRetrying(transactionId);
    try {
      const res = await fetch("/api/admin/fanout/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: savedPassword, transactionId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.ok) {
        alert(
          `retry failed: ${payload.error || res.statusText || "unknown"}`,
        );
      } else {
        // Refresh health payload to show updated row
        const healthRes = await fetch("/api/admin/health", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password: savedPassword }),
        });
        if (healthRes.ok) {
          setHealth(await healthRes.json());
        }
      }
    } catch (err) {
      alert(`retry error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRetrying(null);
    }
  };

  const lock = () => {
    setData(null);
    setHealth(null);
    setError(null);
    setPassword("");
    setSavedPassword("");
  };

  return (
    <div className="min-h-screen">
      <Header />
      <div className="px-6 lg:px-10 py-14 flex items-start justify-center">
        <div className="w-full max-w-4xl">
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
                  platform-agent wallets · recent x402 settlements and
                  commission fan-outs · failed fan-outs with [ retry ].
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
                  title="treasury · x402 facilitator + fan-out signer"
                  wallet={data.treasury}
                  roleNote="signs x402 transferWithAuthorization (in-process facilitator) · signs commission fan-out + bounty payouts"
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
                  <Row label="fuji head block">
                    <span className="text-foreground font-mono">{data.headBlock}</span>
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

                {health && (
                  <HealthSection
                    health={health}
                    retrying={retrying}
                    onRetry={retryFanout}
                  />
                )}
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

function short(addr: string | null): string {
  if (!addr) return "—";
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function fmtUsd(microUsd: string): string {
  const n = Math.abs(Number(microUsd)) / 1e6;
  return n < 1 ? n.toFixed(4) : n.toFixed(2);
}

function HealthSection({
  health,
  retrying,
  onRetry,
}: {
  health: HealthPayload;
  retrying: string | null;
  onRetry: (id: string) => void;
}) {
  return (
    <div className="mt-8 space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
          ❯ x402 fan-out health
        </div>
        {health.failedFanoutCount > 0 ? (
          <div className="border border-[#ff6a6a] bg-surface-1 px-3 py-2 text-[11px] text-[#ff6a6a] mb-3">
            ⚠ {health.failedFanoutCount} failed commission fan-out
            {health.failedFanoutCount > 1 ? "s" : ""} below — creator did not
            receive their cut. Retry once treasury has AVAX for gas + USDC for
            the amount.
          </div>
        ) : (
          <div className="border border-border bg-surface-1 px-3 py-2 text-[11px] text-phosphor mb-3">
            ✓ all recent fan-outs confirmed
          </div>
        )}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-dim mb-2">
          recent x402 settlements · users → platform
        </div>
        <TxTable rows={health.settles} showRetry={false} />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-dim mb-2">
          recent commission fan-outs · platform → creator
        </div>
        <TxTable
          rows={health.fanouts}
          showRetry
          retrying={retrying}
          onRetry={onRetry}
        />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-dim mb-2">
          glacier · avalanche indexer · treasury tx feed
        </div>
        {health.glacier.error ? (
          <div className="border border-[#ff6a6a] bg-surface-1 px-3 py-2 text-[11px] text-[#ff6a6a]">
            glacier error: {health.glacier.error}
          </div>
        ) : health.glacier.transactions.length === 0 ? (
          <div className="border border-border bg-surface-1 px-3 py-2 text-[11px] text-dim">
            no treasury txs returned by glacier
          </div>
        ) : (
          <div className="border border-border bg-background divide-y divide-border">
            {health.glacier.transactions.slice(0, 8).map((t) => (
              <div
                key={t.txHash}
                className="grid grid-cols-[110px_100px_1fr_80px] items-center px-3 py-2 text-[11px] font-mono"
              >
                <span className="text-dim">
                  {t.blockTimestamp
                    ? new Date(t.blockTimestamp * 1000).toLocaleTimeString()
                    : "—"}
                </span>
                <span className="text-muted">{t.method || "transfer"}</span>
                <span className="text-muted truncate">
                  {short(t.from)} → {short(t.to)}
                </span>
                <a
                  href={`${SNOWTRACE_TX}${t.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber hover:text-amber-hi text-right"
                >
                  {short(t.txHash)} ↗
                </a>
              </div>
            ))}
          </div>
        )}
        <div className="text-[10px] text-dim mt-1">
          source: {health.glacier.source}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-dim mb-2">
          env sanity
        </div>
        <div className="border border-border divide-y divide-border">
          <Row label="facilitator">
            <span className="text-muted font-mono">
              {health.env.facilitatorMode}
            </span>
          </Row>
          <Row label="RPC source">
            <span className="text-muted font-mono">{health.env.rpcSource}</span>
          </Row>
          <Row label="payTo">
            <span className="text-muted font-mono">
              {short(health.env.platformPayoutAddress)}
            </span>
          </Row>
          <Row label="network">
            <span className="text-muted font-mono">{health.env.caip2}</span>
          </Row>
        </div>
      </div>
    </div>
  );
}

function TxTable({
  rows,
  showRetry,
  retrying,
  onRetry,
}: {
  rows: TxRow[];
  showRetry: boolean;
  retrying?: string | null;
  onRetry?: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="border border-border bg-surface-1 px-3 py-2 text-[11px] text-dim">
        no rows yet
      </div>
    );
  }
  return (
    <div className="border border-border bg-background divide-y divide-border">
      {rows.slice(0, 10).map((r) => {
        const failed = r.status === "failed";
        return (
          <div
            key={r.id}
            className="grid grid-cols-[90px_1fr_90px_90px_100px] items-center px-3 py-2 text-[11px] font-mono gap-2"
          >
            <span className="text-dim">
              {new Date(r.createdAt).toLocaleTimeString()}
            </span>
            <span
              className={`truncate ${failed ? "text-[#ff6a6a]" : "text-muted"}`}
            >
              {r.description || r.kind}
            </span>
            <span
              className={failed ? "text-[#ff6a6a]" : "text-phosphor"}
            >
              ${fmtUsd(r.grossMicroUsd)}
            </span>
            {r.txHash ? (
              <a
                href={`${SNOWTRACE_TX}${r.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-amber hover:text-amber-hi"
              >
                {short(r.txHash)} ↗
              </a>
            ) : (
              <span className="text-dim">no tx</span>
            )}
            {showRetry && failed && onRetry ? (
              <button
                onClick={() => onRetry(r.id)}
                disabled={retrying === r.id}
                className="text-[10px] uppercase tracking-widest border border-amber text-amber hover:bg-amber hover:text-background disabled:opacity-50 px-2 py-1"
              >
                {retrying === r.id ? "…" : "[ retry ]"}
              </button>
            ) : (
              <span className="text-[10px] uppercase tracking-widest text-dim text-right">
                {r.status}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
