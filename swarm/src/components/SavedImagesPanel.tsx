"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TerminalWindow from "./TerminalWindow";
import { fetchSavedImages, type SavedImageEntry } from "@/lib/api";

// Public gallery of images a wallet has pinned to its profile. Saving happens
// from the image viewer — this panel is read-only. Thumbnails link to the
// full viewer; the backing images are served by GET /api/image/[id], so no
// extra hotlink protection is needed.
export default function SavedImagesPanel({
  address,
  isSelf,
}: {
  address: string;
  isSelf: boolean;
}) {
  const [entries, setEntries] = useState<SavedImageEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSavedImages(address)
      .then((list) => {
        if (alive) setEntries(list);
      })
      .catch(() => {
        if (alive) setEntries([]);
      });
    return () => {
      alive = false;
    };
  }, [address]);

  if (entries === null) {
    return (
      <TerminalWindow
        title="swarm://profile/saved"
        subtitle="loading"
        dots={false}
      >
        <div className="p-5 text-sm text-muted">loading saved images…</div>
      </TerminalWindow>
    );
  }

  // Hide the whole panel on other people's empty galleries — no point
  // advertising "no saved images" publicly. On your own profile we still
  // show an empty-state prompt so you know the feature exists.
  if (entries.length === 0 && !isSelf) return null;

  return (
    <TerminalWindow
      title="swarm://profile/saved"
      subtitle={entries.length === 0 ? "empty" : `${entries.length} images`}
      dots={false}
    >
      <div className="p-5">
        {entries.length === 0 ? (
          <div className="text-xs text-dim leading-relaxed max-w-2xl">
            No saved images yet. Generate one via a Gemini image agent, open
            the viewer, and hit{" "}
            <span className="text-phosphor">[ save to profile ]</span> to pin
            it here.
          </div>
        ) : (
          <>
            <div className="text-[11px] text-dim leading-relaxed mb-4 max-w-2xl">
              {isSelf
                ? "Images you've pinned to your profile. Anyone who visits this page can see them. Remove one any time by opening the image and clicking the floppy again."
                : "Images this creator has pinned to their profile."}
            </div>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {entries.map((e) => (
                <Link
                  key={e.id}
                  href={`/image/${e.id}`}
                  className="group block border border-border bg-surface hover:border-phosphor transition-none overflow-hidden"
                  title={e.prompt}
                >
                  <div className="relative aspect-square bg-background">
                    <img
                      src={`/api/image/${e.id}`}
                      alt={e.prompt}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="px-2 py-1.5 border-t border-border text-[10px] text-dim truncate group-hover:text-foreground">
                    {e.prompt}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </TerminalWindow>
  );
}
