"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TerminalWindow from "./TerminalWindow";
import { fetchGallery, hideImage, type GalleryImageEntry } from "@/lib/api";

// All images this wallet (or its paired MCPs) paid to mint, auto-pinned.
// Owners can enter edit mode (pencil → done) to remove images from their own
// gallery — writes a HiddenImage row, never deletes the underlying generation
// (which is shared). Thumbnails open `/image/<id>?gallery=<address>` so the
// viewer's prev/next arrows cycle through this same list.
export default function ImageGalleryPanel({
  address,
  isSelf,
}: {
  address: string;
  isSelf: boolean;
}) {
  const [entries, setEntries] = useState<GalleryImageEntry[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [hiding, setHiding] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    fetchGallery(address)
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

  const onHide = async (id: string) => {
    if (!isSelf || hiding[id]) return;
    setHiding((p) => ({ ...p, [id]: true }));
    const prev = entries;
    setEntries((list) => (list ? list.filter((e) => e.id !== id) : list));
    try {
      await hideImage(id, address.toLowerCase());
    } catch {
      setEntries(prev);
    } finally {
      setHiding((p) => ({ ...p, [id]: false }));
    }
  };

  if (entries === null) {
    return (
      <TerminalWindow
        title="swarm://profile/images"
        subtitle="loading"
        dots={false}
      >
        <div className="p-5 text-sm text-muted">loading images…</div>
      </TerminalWindow>
    );
  }

  if (entries.length === 0 && !isSelf) return null;

  const canEdit = isSelf && entries.length > 0;

  return (
    <TerminalWindow
      title="swarm://profile/images"
      subtitle={entries.length === 0 ? "empty" : `${entries.length} images`}
      dots={false}
    >
      <div className="p-5">
        {entries.length === 0 ? (
          <div className="text-xs text-dim leading-relaxed max-w-2xl">
            Nothing here yet. Images your linked MCP generates land here
            automatically.
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="text-[11px] text-dim leading-relaxed max-w-2xl">
                {isSelf
                  ? editing
                    ? "Click the × on any image to remove it from your profile. Underlying generation is kept — you can always re-find it via its link."
                    : "Every image tied to this wallet. Click a tile to open the full-screen viewer with prev/next arrows."
                  : "Images this wallet has minted. Click to open the viewer."}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing((e) => !e)}
                  className={`shrink-0 text-[11px] px-3 py-1.5 border transition-none uppercase tracking-widest ${
                    editing
                      ? "border-phosphor text-phosphor hover:bg-phosphor hover:text-background"
                      : "border-border-hi text-foreground hover:border-amber hover:text-amber"
                  }`}
                  title={editing ? "exit edit mode" : "remove images from your profile"}
                >
                  {editing ? "[ done ]" : <PencilIcon />}
                </button>
              )}
            </div>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {entries.map((e) => (
                <GalleryTile
                  key={e.id}
                  entry={e}
                  address={address}
                  editing={editing}
                  hiding={!!hiding[e.id]}
                  onHide={() => onHide(e.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </TerminalWindow>
  );
}

function GalleryTile({
  entry,
  address,
  editing,
  hiding,
  onHide,
}: {
  entry: GalleryImageEntry;
  address: string;
  editing: boolean;
  hiding: boolean;
  onHide: () => void;
}) {
  const content = (
    <div className="relative aspect-square bg-background">
      <img
        src={`/api/image/${entry.id}`}
        alt={entry.prompt}
        loading="lazy"
        className="w-full h-full object-cover"
      />
      {editing && (
        <button
          type="button"
          onClick={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            onHide();
          }}
          disabled={hiding}
          aria-label="remove from profile"
          title="remove from profile"
          className="absolute top-1.5 right-1.5 w-6 h-6 border border-amber bg-background/90 text-amber hover:bg-amber hover:text-background transition-none flex items-center justify-center text-[13px] leading-none disabled:opacity-40"
        >
          ×
        </button>
      )}
    </div>
  );

  const caption = (
    <div className="px-2 py-1.5 border-t border-border text-[10px] text-dim truncate group-hover:text-foreground">
      {entry.prompt}
    </div>
  );

  if (editing) {
    return (
      <div
        className="group block border border-border bg-surface overflow-hidden"
        title={entry.prompt}
      >
        {content}
        {caption}
      </div>
    );
  }

  return (
    <Link
      href={`/image/${entry.id}?gallery=${address}`}
      className="group block border border-border bg-surface hover:border-phosphor transition-none overflow-hidden"
      title={entry.prompt}
    >
      {content}
      {caption}
    </Link>
  );
}

function PencilIcon() {
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
      <path d="M11 2l3 3-8.5 8.5H2.5v-3z" />
      <path d="M10 3l3 3" />
    </svg>
  );
}
