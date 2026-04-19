"use client";

import { useEffect, useRef, useState } from "react";
import { fetchActivity, type ActivityItem } from "@/lib/api";
import { fallbackActivity, mergeActivity } from "@/lib/demoActivity";

// ASCII-only glyphs so every bracket `[x]` renders at the same width and
// baseline. `★` and `◎` visually shrink inside JetBrains Mono and throw the
// brackets off-center, so we keep to plain ASCII.
const typeGlyph: Record<ActivityItem["type"], string> = {
  payment: "$",
  reputation: "*",
  task: "o",
  registration: "+",
};

const typeColor: Record<ActivityItem["type"], string> = {
  payment: "text-amber",
  reputation: "text-phosphor",
  task: "text-info",
  registration: "text-foreground",
};

interface FeedItem extends ActivityItem {
  _key: string;
  _dropping?: boolean;
}

const VISIBLE = 3; // keep the feed compact so the hero balances

function timeLabel(ts: number) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 1) return "now";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

export default function ActivityTicker() {
  const [items, setItems] = useState<FeedItem[]>(() =>
    fallbackActivity.slice(0, VISIBLE).map((a, i) => ({ ...a, _key: `seed-${i}` }))
  );
  const [, rerender] = useState(0);
  const realSeenTs = useRef<Set<number>>(new Set());

  // Tick each second for relative timestamps
  useEffect(() => {
    const iv = setInterval(() => rerender((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // Push a new item to the top and drop the oldest immediately · the feed is
  // always exactly VISIBLE rows. The new top gets a pop-in flash; the CSS
  // layout shift handles the rest.
  const pushItem = (next: FeedItem) => {
    setItems((cur) => {
      if (cur.some((x) => x.message === next.message)) return cur;
      return [next, ...cur].slice(0, VISIBLE);
    });
  };

  // Real server activity every 5s · merge anything new
  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchActivity();
        for (const d of data.slice().reverse()) {
          if (realSeenTs.current.has(d.timestamp)) continue;
          realSeenTs.current.add(d.timestamp);
          pushItem({ ...d, _key: `real-${d.timestamp}-${Math.random()}` });
        }
      } catch {
        // transient fetch miss — next poll will retry.
      }
    };
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, []);

  const visible = items.slice(0, VISIBLE);

  return (
    <div className="bg-surface">
      <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-widest border-b border-border text-phosphor">
        <span className="w-1.5 h-1.5 bg-phosphor dot-pulse" />
        live feed
      </div>

      <div className="overflow-hidden select-none">
        {visible.map((item, i) => (
          <div
            key={item._key}
            className={`flex items-start gap-2.5 px-3 py-2 border-b border-border last:border-b-0 text-xs ${
              i === 0 ? "activity-pop" : ""
            }`}
          >
            {/* `[x]` rendered as a single mono text run so every row lines
                up regardless of which glyph sits inside. `mt-[2px]` nudges
                it optically centered against the first line of message text. */}
            <span
              className={`${typeColor[item.type]} font-mono font-bold flex-shrink-0 mt-[2px] leading-snug tabular-nums`}
            >
              [{typeGlyph[item.type]}]
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-foreground leading-snug">{item.message}</div>
              <div className="text-[10px] text-dim mt-0.5 tabular-nums">
                {timeLabel(item.timestamp)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
