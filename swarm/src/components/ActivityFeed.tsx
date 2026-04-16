"use client";

import { useEffect, useState } from "react";
import { fetchActivity, type ActivityItem } from "@/lib/api";
import { fallbackActivity, mergeActivity } from "@/lib/demoActivity";

const typeStyles = {
  payment: { icon: "↗", color: "text-amber", label: "Payment" },
  reputation: { icon: "★", color: "text-yellow-400", label: "Reputation" },
  task: { icon: "◎", color: "text-blue-400", label: "Escalation" },
  registration: { icon: "＋", color: "text-emerald-400", label: "Joined" },
};

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function cyclicalSlice(items: ActivityItem[], startIndex: number, count: number) {
  if (items.length === 0) return [];
  return Array.from({ length: Math.min(count, items.length) }, (_, offset) => {
    return items[(startIndex + offset) % items.length];
  });
}

export default function ActivityFeed({ variant = "default" }: { variant?: "default" | "hero" }) {
  const [activity, setActivity] = useState<ActivityItem[]>(fallbackActivity);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchActivity();
        setActivity((current) => mergeActivity(data, current).slice(0, 18));
      } catch {
        // server not running yet
      }
    };
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (variant !== "hero" || activity.length < 2) return;

    const interval = setInterval(() => {
      setActiveIndex((current) => (current + 1) % activity.length);
    }, 2400);

    return () => clearInterval(interval);
  }, [activity.length, variant]);

  if (variant === "hero") {
    const windowed = cyclicalSlice(activity, activeIndex, 5);
    const lead = windowed[0];
    const queue = windowed.slice(1);

    if (!lead) {
      return null;
    }

    const leadStyle = typeStyles[lead.type];

    return (
      <div className="relative rounded-[1.75rem] border border-border/80 bg-surface/90 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 rounded-[1.75rem] bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.18),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.12),transparent_32%)]" />
        <div className="relative">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-amber/80">Live Activity</p>
              <p className="text-sm text-text-muted mt-2">Seeded marketplace motion for the demo. Real events slide in underneath.</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.22em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot" />
              Active
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/70 p-4 mb-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className={`flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.24em] ${leadStyle.color}`}>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-current/20 bg-current/10 text-sm">
                  {leadStyle.icon}
                </span>
                {leadStyle.label}
              </div>
              <span className="text-[11px] font-mono text-text-dim">{timeAgo(lead.timestamp)}</span>
            </div>
            <p className="text-sm leading-relaxed text-foreground">{lead.message}</p>
          </div>

          <div className="space-y-2">
            {queue.map((item, index) => {
              const style = typeStyles[item.type];
              return (
                <div
                  key={`${item.timestamp}-${index}`}
                  className="flex items-start gap-3 rounded-xl border border-border/60 bg-surface-raised/50 px-3 py-2.5 text-sm"
                >
                  <span className={`mt-0.5 text-xs font-mono ${style.color}`}>{style.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed text-text-muted">{item.message}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-mono text-text-dim">{timeAgo(item.timestamp)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {activity.slice(0, 20).map((item, i) => {
        const style = typeStyles[item.type];
        return (
          <div
            key={`${item.timestamp}-${i}`}
            className="flex items-start gap-3 py-2 px-3 rounded-lg bg-surface-raised/50 border border-border/50 text-sm animate-fade-up"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="flex-shrink-0 mt-0.5">{style.icon}</span>
            <div className="min-w-0 flex-1">
              <p className={`${style.color} font-mono text-xs leading-relaxed`}>
                {item.message}
              </p>
            </div>
            <span className="text-[10px] text-text-dim font-mono flex-shrink-0 mt-0.5">
              {timeAgo(item.timestamp)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
