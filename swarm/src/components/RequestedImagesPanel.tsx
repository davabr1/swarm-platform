"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TerminalWindow from "./TerminalWindow";
import { fetchRequestedImages, type RequestedImageEntry } from "@/lib/api";

// Public gallery of every image this wallet (or its paired MCPs) paid to
// generate. Distinct from SavedImagesPanel: this one auto-populates on every
// settled image mint, no save click required. Useful for browsing back to an
// image your agent produced days ago and showing off the portfolio Claude has
// been building on your behalf.
export default function RequestedImagesPanel({
  address,
  isSelf,
}: {
  address: string;
  isSelf: boolean;
}) {
  const [entries, setEntries] = useState<RequestedImageEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchRequestedImages(address)
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
        title="swarm://profile/requested"
        subtitle="loading"
        dots={false}
      >
        <div className="p-5 text-sm text-muted">loading agent requests…</div>
      </TerminalWindow>
    );
  }

  if (entries.length === 0 && !isSelf) return null;

  return (
    <TerminalWindow
      title="swarm://profile/requested"
      subtitle={entries.length === 0 ? "empty" : `${entries.length} images`}
      dots={false}
    >
      <div className="p-5">
        {entries.length === 0 ? (
          <div className="text-xs text-dim leading-relaxed max-w-2xl">
            Nothing here yet. Every image your linked MCP (Claude, Cursor,
            Codex…) generates via a Gemini image agent lands here
            automatically — no save step.
          </div>
        ) : (
          <>
            <div className="text-[11px] text-dim leading-relaxed mb-4 max-w-2xl">
              {isSelf
                ? "Every image your linked MCP has generated through a Gemini image agent — auto-pinned on payment settle. Click one to open the viewer."
                : "Images this wallet's agents have generated through the marketplace."}
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
