"use client";

import { useCallback, useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import {
  fetchGallery,
  type GalleryImageEntry,
} from "@/lib/api";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address: connected } = useAccount();
  // `?gallery=<profileAddress>` means this viewer was opened from a profile
  // grid. We only paginate (prev/next + neighbors fetch) when the connected
  // wallet matches that profile — so sharing a single image URL never leaks
  // a side-channel into the owner's full gallery.
  const galleryAddress = searchParams.get("gallery");
  const isOwner =
    !!galleryAddress &&
    !!connected &&
    galleryAddress.toLowerCase() === connected.toLowerCase();
  const [meta, setMeta] = useState<ImageMeta | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [gallery, setGallery] = useState<GalleryImageEntry[] | null>(null);

  useEffect(() => {
    if (!galleryAddress || !isOwner) {
      setGallery(null);
      return;
    }
    let alive = true;
    fetchGallery(galleryAddress)
      .then((list) => {
        if (alive) setGallery(list);
      })
      .catch(() => {
        if (alive) setGallery([]);
      });
    return () => {
      alive = false;
    };
  }, [galleryAddress, isOwner]);

  const { prevId, nextId, index, total } = useMemo(() => {
    if (!gallery || gallery.length === 0) {
      return { prevId: null, nextId: null, index: -1, total: 0 };
    }
    const i = gallery.findIndex((g) => g.id === id);
    return {
      prevId: i > 0 ? gallery[i - 1].id : null,
      nextId: i >= 0 && i < gallery.length - 1 ? gallery[i + 1].id : null,
      index: i,
      total: gallery.length,
    };
  }, [gallery, id]);

  const navigate = useCallback(
    (targetId: string | null) => {
      if (!targetId || !galleryAddress || !isOwner) return;
      router.push(`/image/${targetId}?gallery=${galleryAddress}`);
    },
    [galleryAddress, isOwner, router],
  );

  useEffect(() => {
    if (!isOwner) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
      }
      if (e.key === "ArrowLeft") navigate(prevId);
      else if (e.key === "ArrowRight") navigate(nextId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOwner, navigate, prevId, nextId]);

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
            {galleryAddress && isOwner && (
              <div className="mb-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-widest">
                <Link
                  href={`/profile/${galleryAddress}`}
                  className="text-muted hover:text-amber transition-none"
                >
                  ← back to profile
                </Link>
                {total > 0 && index >= 0 && (
                  <span className="text-dim tabular-nums">
                    {index + 1} / {total}
                  </span>
                )}
              </div>
            )}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] text-dim uppercase tracking-widest">
                swarm://image/{id.slice(0, 8)}…
              </div>
              <a
                href={`/api/image/${id}?download=1`}
                download
                className="border border-amber bg-amber text-background text-[11px] px-4 py-2 hover:bg-amber-hi transition-none uppercase tracking-widest"
              >
                [ download PNG ↓ ]
              </a>
            </div>

            <div className="relative w-full flex items-center justify-center">
              {isOwner && (
                <button
                  type="button"
                  onClick={() => navigate(prevId)}
                  disabled={!prevId}
                  aria-label="previous image"
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-10 border border-border-hi bg-background/80 text-foreground px-3 py-4 hover:border-phosphor hover:text-phosphor transition-none disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  ◀
                </button>
              )}
              <img
                src={`/api/image/${id}`}
                alt={meta?.prompt ?? "generated image"}
                className="max-w-[85vw] max-h-[85vh] w-auto h-auto object-contain"
              />
              {isOwner && (
                <button
                  type="button"
                  onClick={() => navigate(nextId)}
                  disabled={!nextId}
                  aria-label="next image"
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-10 border border-border-hi bg-background/80 text-foreground px-3 py-4 hover:border-phosphor hover:text-phosphor transition-none disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  ▶
                </button>
              )}
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

function BreakdownRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="text-foreground tabular-nums">{value ?? "—"} USDC</span>
    </div>
  );
}
