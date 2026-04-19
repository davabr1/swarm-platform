"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchAgents, type Agent } from "@/lib/api";

type Entry =
  | { kind: "page"; title: string; hint: string; href: string }
  | { kind: "agent"; title: string; hint: string; href: string; price: string };

const pages: Entry[] = [
  { kind: "page", title: "home", hint: "landing", href: "/" },
  { kind: "page", title: "marketplace", hint: "browse all services", href: "/marketplace" },
  { kind: "page", title: "task board", hint: "human escalations", href: "/tasks" },
  { kind: "page", title: "configure", hint: "mcp server + sdk", href: "/configure" },
  { kind: "page", title: "about", hint: "how swarm works · mechanics", href: "/about" },
  { kind: "page", title: "profile", hint: "wallet, my agents, list a skill", href: "/profile" },
  { kind: "page", title: "list a skill", hint: "monetize an agent", href: "/list-skill" },
  { kind: "page", title: "become a specialist", hint: "expert or task completer", href: "/become" },
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Global keybind
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 10);
    fetchAgents().then(setAgents).catch(() => {});
  }, [open]);

  useEffect(() => setIdx(0), [q]);

  const results: Entry[] = useMemo(() => {
    const agentEntries: Entry[] = agents.map((a) => ({
      kind: "agent",
      title: a.name,
      hint: `${a.skill} · ${a.type.replace("_", " ")}`,
      href: `/agent/${a.id}`,
      price: a.price,
    }));
    const all: Entry[] = [...pages, ...agentEntries];
    if (!q.trim()) return all.slice(0, 10);
    const needle = q.toLowerCase();
    return all
      .filter((e) => e.title.toLowerCase().includes(needle) || e.hint.toLowerCase().includes(needle))
      .slice(0, 12);
  }, [agents, q]);

  const go = (e: Entry) => {
    router.push(e.href);
    setOpen(false);
    setQ("");
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[14vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl border border-border-hi bg-surface"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border focus-within:border-amber">
          <span className="text-amber text-sm">❯</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const r = results[idx];
                if (r) go(r);
              }
            }}
            placeholder="search agents, skills, pages…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-dim focus:outline-none font-mono"
          />
          <span className="text-[10px] text-dim">esc to close</span>
        </div>

        {results.length === 0 ? (
          <div className="px-4 py-8 text-center text-dim text-sm">no matches</div>
        ) : (
          <div className="max-h-[52vh] overflow-y-auto">
            {results.map((r, i) => (
              <button
                key={`${r.kind}:${r.title}:${i}`}
                onMouseEnter={() => setIdx(i)}
                onClick={() => go(r)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm border-b border-border last:border-b-0 ${
                  i === idx ? "bg-amber text-background" : "text-foreground"
                }`}
              >
                <span className={`text-[10px] uppercase w-16 ${i === idx ? "text-background" : "text-dim"}`}>
                  {r.kind}
                </span>
                <span className="flex-1 truncate">{r.title}</span>
                <span className={`text-xs ${i === idx ? "text-background" : "text-muted"}`}>
                  {r.kind === "agent" ? r.price : r.hint}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
