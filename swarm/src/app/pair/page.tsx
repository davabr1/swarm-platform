"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useAccount,
  useBalance,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import TerminalWindow from "@/components/TerminalWindow";
import PostPairSetup from "@/components/PostPairSetup";
import MCPRegistryABI from "@/abis/MCPRegistry.json";
import {
  FUJI_CHAIN_ID,
  MCP_REGISTRY_ADDRESS as REGISTRY_ADDRESS,
  USDC_ERC20_ABI,
  USDC_FUJI,
} from "@/lib/fuji";

const FAUCET_URL = "https://faucet.circle.com/";
const TOPUP_PRESETS_USDC = [1, 2, 5, 10] as const;

export default function PairPage() {
  return (
    <Suspense fallback={<Shell><div className="text-sm text-muted">loading…</div></Shell>}>
      <PairInner />
    </Suspense>
  );
}

function PairInner() {
  const params = useSearchParams();
  const mcpAddress = (params.get("mcpAddress") ?? params.get("address") ?? "").toLowerCase();
  const valid = /^0x[0-9a-f]{40}$/.test(mcpAddress);

  if (!valid) {
    return (
      <Shell>
        <TerminalWindow title="swarm://pair" subtitle="link MCP to your wallet">
          <div className="p-6 text-sm text-danger space-y-2">
            <div>Invalid or missing MCP address in URL.</div>
            <div className="text-dim text-[12px]">
              Run <code className="text-foreground">npx -y swarm-marketplace-mcp pair</code> in
              your terminal to mint (or load) an MCP wallet — the CLI prints a{" "}
              <code className="text-foreground">/pair?mcpAddress=0x…</code> URL pointing back here.
            </div>
          </div>
        </TerminalWindow>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="w-full max-w-xl">
        <TerminalWindow title="swarm://pair" subtitle="link MCP to your wallet">
          <div className="p-6">
            <PairView mcpAddress={mcpAddress as `0x${string}`} />
          </div>
        </TerminalWindow>
      </div>
    </Shell>
  );
}

function PairView({ mcpAddress }: { mcpAddress: `0x${string}` }) {
  const { address: connected, isConnected } = useAccount();

  const { data: balance, refetch: refetchMcpBalance } = useBalance({
    address: mcpAddress,
    token: USDC_FUJI,
    chainId: FUJI_CHAIN_ID,
    query: { refetchInterval: 5_000 },
  });

  const { data: mainBalance } = useBalance({
    address: connected,
    token: USDC_FUJI,
    chainId: FUJI_CHAIN_ID,
    query: { enabled: Boolean(connected), refetchInterval: 10_000 },
  });

  const registryDeployed = REGISTRY_ADDRESS.length > 0;

  const { data: owner, refetch: refetchOwner } = useReadContract({
    address: registryDeployed ? (REGISTRY_ADDRESS as `0x${string}`) : undefined,
    abi: MCPRegistryABI,
    functionName: "ownerOf",
    args: [mcpAddress],
    chainId: FUJI_CHAIN_ID,
    query: { enabled: registryDeployed, refetchInterval: 10_000 },
  });

  const {
    writeContract,
    data: registerHash,
    isPending: registerPending,
    error: registerError,
  } = useWriteContract();
  const { isLoading: confirming, isSuccess: registered } = useWaitForTransactionReceipt({
    hash: registerHash,
    chainId: FUJI_CHAIN_ID,
  });

  // Transfer USDC from the connected main wallet straight to the MCP address.
  // Plain ERC-20 — not x402 — since the user is funding *their own* wallet.
  const {
    writeContract: writeTopup,
    data: topupHash,
    isPending: topupPending,
    error: topupError,
  } = useWriteContract();
  const { isLoading: topupConfirming, isSuccess: topupDone } = useWaitForTransactionReceipt({
    hash: topupHash,
    chainId: FUJI_CHAIN_ID,
  });
  const [lastTopupUsd, setLastTopupUsd] = useState<number | null>(null);

  useEffect(() => {
    if (registered) refetchOwner();
  }, [registered, refetchOwner]);

  useEffect(() => {
    if (topupDone) refetchMcpBalance();
  }, [topupDone, refetchMcpBalance]);

  const onTopUp = (usd: number) => {
    setLastTopupUsd(usd);
    writeTopup({
      address: USDC_FUJI,
      abi: USDC_ERC20_ABI,
      functionName: "transfer",
      args: [mcpAddress, BigInt(usd) * BigInt(1_000_000)],
      chainId: FUJI_CHAIN_ID,
    });
  };

  const mainUsdc = mainBalance ? Number(mainBalance.value) / 1_000_000 : 0;
  const mainHasUsdc = mainUsdc >= 1;
  const affordable = TOPUP_PRESETS_USDC.filter((amt) => amt <= mainUsdc);
  const topupBusy = topupPending || topupConfirming;

  const [copied, setCopied] = useState(false);
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(mcpAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard denied
    }
  };

  const microUsd = balance?.value ?? BigInt(0);
  const funded = microUsd > BigInt(0);
  const balanceStr = balance
    ? (Number(microUsd) / 1_000_000).toFixed(microUsd < BigInt(1_000_000) ? 3 : 2)
    : "—";

  const ownerNormalized =
    typeof owner === "string" && owner !== "0x0000000000000000000000000000000000000000"
      ? owner.toLowerCase()
      : null;
  const connectedNormalized = connected?.toLowerCase() ?? null;
  const ownedByConnected =
    ownerNormalized !== null && connectedNormalized !== null && ownerNormalized === connectedNormalized;
  const ownedByOther = ownerNormalized !== null && !ownedByConnected;

  const onRegister = () => {
    if (!registryDeployed) return;
    writeContract({
      address: REGISTRY_ADDRESS as `0x${string}`,
      abi: MCPRegistryABI,
      functionName: "register",
      args: [mcpAddress],
      chainId: FUJI_CHAIN_ID,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-dim mb-2">
          your MCP wallet
        </div>
        <div className="border border-border bg-background px-4 py-4">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div className="text-[10px] uppercase tracking-widest text-dim">
              balance
            </div>
            <div className="tabular-nums">
              <span
                className={`text-3xl font-semibold ${
                  funded ? "text-phosphor" : "text-amber"
                }`}
              >
                {balanceStr}
              </span>
              <span className="text-xs text-dim ml-1.5 uppercase tracking-widest">
                USDC
              </span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border font-mono text-[12px] text-foreground break-all">
            {mcpAddress}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button
            onClick={copyAddress}
            className="border border-border text-dim text-[11px] px-3 py-1 hover:border-foreground hover:text-foreground transition-none bg-transparent cursor-pointer"
          >
            {copied ? "[ copied ✓ ]" : "[ copy address ]"}
          </button>
          <a
            href={`https://testnet.snowtrace.io/address/${mcpAddress}`}
            target="_blank"
            rel="noreferrer"
            className="border border-border text-dim text-[11px] px-3 py-1 hover:border-foreground hover:text-foreground transition-none"
          >
            [ view on snowtrace ↗ ]
          </a>
        </div>
      </div>

      {/* Registry step */}
      {!registryDeployed ? (
        <div className="border border-dim bg-surface px-4 py-3 text-[12px] text-dim leading-relaxed">
          <div className="text-[10px] uppercase tracking-widest mb-1">registry not deployed</div>
          On-chain MCP↔wallet linking isn&apos;t live yet (set{" "}
          <code className="text-foreground">NEXT_PUBLIC_MCP_REGISTRY_ADDRESS</code>). You can still
          fund this wallet and use it — calls will work; they just won&apos;t show up on your{" "}
          <code className="text-foreground">/profile</code> yet.
        </div>
      ) : !isConnected ? (
        <div className="border border-amber bg-surface px-4 py-3 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-amber">
            step 1 · connect your main wallet
          </div>
          <div className="text-[12px] text-foreground leading-relaxed">
            Connect the wallet you want this MCP to be linked to. You&apos;ll sign one on-chain tx
            — no gas for the MCP, only for this one {"{"}register{"}"} call.
          </div>
          <div className="pt-1">
            <ConnectButton />
          </div>
        </div>
      ) : ownedByOther ? (
        <div className="border border-danger bg-surface px-4 py-3 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-danger">
            already linked to another wallet
          </div>
          <div className="text-[12px] text-foreground leading-relaxed">
            This MCP is registered to{" "}
            <code className="text-foreground break-all">{ownerNormalized}</code>. Connect that
            wallet (or{" "}
            <code className="text-foreground">unregister</code> from its{" "}
            <code className="text-foreground">/profile</code>) to re-link.
          </div>
        </div>
      ) : ownedByConnected ? (
        <div className="border border-phosphor bg-surface px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest text-phosphor">
            ✓ linked to {truncate(connectedNormalized!)}
          </div>
          <div className="text-[12px] text-foreground mt-1">
            This MCP is registered to your main wallet. It will appear on{" "}
            <code className="text-foreground">/profile</code> alongside its balance and spend history.
          </div>
        </div>
      ) : (
        <div className="border border-amber bg-surface px-4 py-3 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-amber">
              step 1 · link this MCP to your wallet
            </div>
            <div className="text-[12px] text-foreground leading-relaxed mt-1">
              Sign one on-chain{" "}
              <code className="text-foreground">
                MCPRegistry.register(0x{mcpAddress.slice(2, 6)}…)
              </code>{" "}
              tx so Swarm can show this MCP on your profile and attribute its spend to you.
            </div>
          </div>
          <div>
            <button
              onClick={onRegister}
              disabled={registerPending || confirming}
              className="border border-amber text-background bg-amber text-[11px] px-4 py-2 hover:bg-amber-hi disabled:opacity-50 disabled:cursor-not-allowed transition-none"
            >
              {registerPending
                ? "[ waiting for signature… ]"
                : confirming
                  ? "[ confirming on Fuji… ]"
                  : "[ link MCP → my wallet ]"}
            </button>
          </div>
          {registerError && (
            <div className="text-[11px] text-danger">
              {registerError.message.slice(0, 200)}
            </div>
          )}
          {registerHash && (
            <div>
              <a
                href={`https://testnet.snowtrace.io/tx/${registerHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-dim hover:text-amber underline break-all"
              >
                tx: {truncate(registerHash)} ↗
              </a>
            </div>
          )}
        </div>
      )}

      {funded && ownedByConnected && <PostPairSetup />}

      {funded && !ownedByConnected && (
        <div className="border border-phosphor bg-surface px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest text-phosphor">
            ✓ funded — ready for agent calls
          </div>
          <div className="text-[11px] text-dim mt-1 leading-relaxed">
            Every paid call signs an EIP-3009 transfer and settles via x402 in ~2s. Page polls every
            5s; balance updates automatically.
          </div>
        </div>
      )}

      {!funded && isConnected && mainHasUsdc && (
        <div className="border border-amber bg-surface px-4 py-3 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-amber">
              fund from your main wallet
            </div>
            <div className="text-[12px] text-foreground leading-relaxed mt-1">
              Your connected wallet holds{" "}
              <span className="text-phosphor tabular-nums">{mainUsdc.toFixed(2)} USDC</span>. Send some
              to this MCP — one on-chain <code className="text-foreground">USDC.transfer</code>, no
              faucet detour.
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(affordable.length > 0 ? affordable : TOPUP_PRESETS_USDC).map((amt) => {
              const disabled = topupBusy || amt > mainUsdc;
              return (
                <button
                  key={amt}
                  onClick={() => onTopUp(amt)}
                  disabled={disabled}
                  className="border border-border-hi bg-surface-1 text-foreground text-[11px] px-3 py-1.5 tabular-nums hover:border-amber hover:text-amber transition-none disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  +{amt} USDC
                </button>
              );
            })}
            {topupBusy && (
              <span className="text-[11px] text-amber tabular-nums">
                {topupPending
                  ? `signing +${lastTopupUsd}…`
                  : `confirming +${lastTopupUsd}…`}
              </span>
            )}
            {topupDone && !topupBusy && (
              <span className="text-[11px] text-phosphor">sent +{lastTopupUsd} ✓</span>
            )}
          </div>
          {topupError && (
            <div className="text-[11px] text-danger">
              {topupError.message.slice(0, 200)}
            </div>
          )}
          {topupHash && (
            <a
              href={`https://testnet.snowtrace.io/tx/${topupHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-dim hover:text-amber underline"
            >
              tx: {truncate(topupHash)} ↗
            </a>
          )}
          <div className="text-[10px] text-dim">
            Out of USDC?{" "}
            <a
              href={FAUCET_URL}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-amber"
            >
              Circle faucet ↗
            </a>{" "}
            drops 20 USDC per request on Fuji.
          </div>
        </div>
      )}

      {!funded && (!isConnected || !mainHasUsdc) && (
        <div className="border border-amber bg-surface px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
            get test USDC
          </div>
          <div className="text-[12px] text-foreground mb-2">
            {isConnected
              ? `Your connected wallet has ${mainUsdc.toFixed(2)} USDC — grab some from the faucet first, then fund your MCP.`
              : "Circle drops 20 USDC per request on Fuji. Paste the MCP address above into the faucet."}
          </div>
          <a
            href={FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-block border border-amber text-amber text-[11px] px-3 py-1 hover:bg-amber hover:text-background transition-none"
          >
            [ open Circle faucet ↗ ]
          </a>
          <div className="text-[10px] text-dim mt-2">
            Pick <span className="text-foreground">Avalanche Fuji</span> in the network dropdown — wrong-network is the #1 reason drops don&apos;t show up.
          </div>
        </div>
      )}

      <div className="text-[11px] text-dim leading-relaxed border-t border-border pt-4">
        <div className="text-[10px] uppercase tracking-widest mb-2 text-dim">
          how x402 payments work
        </div>
        <div>
          This address holds its own USDC. When an agent call triggers{" "}
          <code className="text-foreground">402 Payment Required</code>, the MCP signs an{" "}
          <code className="text-foreground">EIP-3009 transferWithAuthorization</code> with the
          private key stored at{" "}
          <code className="text-foreground">~/.swarm-mcp/session.json</code>. A facilitator
          settles it on Fuji in ~2s. No gas for you. No bearer tokens. USDC moves peer-to-peer per call.
        </div>
      </div>
    </div>
  );
}

function truncate(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
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
