"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import { fetchSavedState, saveImage, unsaveImage } from "@/lib/api";

interface ImageMeta {
  id: string;
  status: string;
  prompt: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  readyAt: string | null;
  breakdown: {
    commissionUsd: string | null;
    geminiCostUsd: string | null;
    platformFeeUsd: string | null;
    totalUsd: string | null;
  };
  settlementTxHash: string | null;
  agent: {
    id: string;
    name: string;
    creatorAddress: string | null;
    walletAddress: string;
  } | null;
}

export default function ImageViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { address: connected } = useAccount();
  const viewer = connected?.toLowerCase() ?? null;
  const [meta, setMeta] = useState<ImageMeta | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [savingToggle, setSavingToggle] = useState(false);

  useEffect(() => {
    fetch(`/api/image/${id}/meta`)
      .then(async (res) => {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        setMeta(await res.json());
      })
      .catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => {
    if (!viewer) {
      setSaved(null);
      return;
    }
    fetchSavedState(id, viewer).then(setSaved).catch(() => setSaved(false));
  }, [id, viewer]);

  const onToggleSave = async () => {
    if (!viewer || saved === null || savingToggle) return;
    const next = !saved;
    setSaved(next);
    setSavingToggle(true);
    try {
      if (next) await saveImage(id, viewer);
      else await unsaveImage(id, viewer);
    } catch {
      setSaved(!next);
    } finally {
      setSavingToggle(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <CommandPalette />
      <div className="px-6 lg:px-10 py-8 max-w-6xl mx-auto">
        {notFound ? (
          <div className="text-center py-24 text-sm text-dim">
            image not found —{" "}
            <Link href="/marketplace" className="text-amber underline">
              back to marketplace
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] text-dim uppercase tracking-widest">
                swarm://image/{id.slice(0, 8)}…
              </div>
              <div className="flex items-center gap-2">
                {viewer ? (
                  <button
                    onClick={onToggleSave}
                    disabled={saved === null || savingToggle}
                    className={`border text-[11px] px-4 py-2 transition-none uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40 ${
                      saved
                        ? "border-phosphor text-phosphor hover:bg-phosphor hover:text-background"
                        : "border-border-hi text-foreground hover:border-phosphor hover:text-phosphor"
                    }`}
                    title={
                      saved
                        ? "Remove from your profile gallery"
                        : "Pin to your profile gallery"
                    }
                  >
                    <FloppyIcon filled={Boolean(saved)} />
                    {saved ? "[ saved ]" : "[ save to profile ]"}
                  </button>
                ) : (
                  <span
                    className="border border-border text-dim text-[11px] px-4 py-2 uppercase tracking-widest flex items-center gap-1.5 cursor-not-allowed"
                    title="Connect your wallet to save this image to your profile"
                  >
                    <FloppyIcon filled={false} />
                    [ connect to save ]
                  </span>
                )}
                <a
                  href={`/api/image/${id}?download=1`}
                  download
                  className="border border-amber bg-amber text-background text-[11px] px-4 py-2 hover:bg-amber-hi transition-none uppercase tracking-widest"
                >
                  [ download PNG ↓ ]
                </a>
              </div>
            </div>

            <div className="w-full flex items-center justify-center">
              <img
                src={`/api/image/${id}`}
                alt={meta?.prompt ?? "generated image"}
                className="max-w-[85vw] max-h-[85vh] w-auto h-auto object-contain"
              />
            </div>

            {meta && (
              <div className="mt-6 grid gap-4 md:grid-cols-2 text-[12px]">
                <div className="border border-border bg-surface p-4">
                  <div className="text-[10px] uppercase tracking-widest text-dim mb-2">
                    prompt
                  </div>
                  <div className="text-foreground whitespace-pre-wrap break-words">
                    {meta.prompt}
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-dim">
                    cost breakdown
                  </div>
                  <BreakdownRow label="creator commission" value={meta.breakdown.commissionUsd} />
                  <BreakdownRow label="AI cost" value={meta.breakdown.geminiCostUsd} />
                  <BreakdownRow label="platform fee (5%)" value={meta.breakdown.platformFeeUsd} />
                  <div className="border-t border-border pt-2 mt-1 flex items-center justify-between">
                    <span className="text-foreground font-semibold">total paid</span>
                    <span className="text-phosphor tabular-nums">
                      {meta.breakdown.totalUsd ?? "—"} USDC
                    </span>
                  </div>
                  {meta.settlementTxHash && (
                    <a
                      href={`https://testnet.snowtrace.io/tx/${meta.settlementTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-[11px] text-dim hover:text-amber underline mt-2 break-all"
                    >
                      settled · {meta.settlementTxHash.slice(0, 10)}… ↗
                    </a>
                  )}
                </div>

                {meta.agent && (
                  <div className="md:col-span-2 border border-border bg-surface p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-dim">
                        generated by
                      </div>
                      <div className="text-foreground mt-1">{meta.agent.name}</div>
                    </div>
                    <Link
                      href={`/agent/${meta.agent.id}`}
                      className="text-[11px] text-amber underline hover:text-amber-hi"
                    >
                      view agent →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FloppyIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
    >
      <path d="M1.5 1.5h10L14.5 4.5v10h-13z" fill={filled ? "currentColor" : "none"} />
      <path d="M4.5 1.5v3.5h6v-3.5" stroke={filled ? "var(--background)" : "currentColor"} />
      <rect
        x="4.5"
        y="9"
        width="7"
        height="5.5"
        stroke={filled ? "var(--background)" : "currentColor"}
        fill="none"
      />
    </svg>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="text-foreground tabular-nums">{value ?? "—"} USDC</span>
    </div>
  );
}
