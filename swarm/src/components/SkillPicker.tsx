"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface SkillPickerProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  catalog?: string[];
  inUse?: string[];
}

export default function SkillPicker({
  value,
  onChange,
  placeholder = "pick a skill or type a custom tag…",
  allowEmpty = false,
  catalog: catalogProp,
  inUse: inUseProp,
}: SkillPickerProps) {
  const [catalog, setCatalog] = useState<string[]>(catalogProp ?? []);
  const [inUse, setInUse] = useState<string[]>(inUseProp ?? []);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (catalogProp) return;
    let cancelled = false;
    fetch("/api/skills")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setCatalog(Array.isArray(j.catalog) ? j.catalog : []);
        setInUse(Array.isArray(j.inUse) ? j.inUse : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [catalogProp]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const merged = Array.from(new Set([...(inUse ?? []), ...catalog]));
    if (!q) return merged.slice(0, 40);
    return merged.filter((s) => s.toLowerCase().includes(q)).slice(0, 40);
  }, [query, catalog, inUse]);

  const isCustom = query.trim().length > 0 && !catalog.includes(query.trim()) && !inUse.includes(query.trim());

  const commit = (v: string) => {
    onChange(v);
    setQuery(v);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="border border-border bg-surface-1 focus-within:border-border-hi flex items-center">
        <span className="pl-3 text-amber text-sm select-none">❯</span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent px-2 py-2.5 text-sm text-foreground placeholder:text-dim focus:outline-none focus-visible:outline-none font-mono"
        />
        {isCustom && (
          <span className="pr-3 text-[10px] uppercase tracking-widest text-phosphor select-none">
            custom
          </span>
        )}
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 border border-border-hi bg-surface max-h-64 overflow-auto shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
          {allowEmpty && (
            <button
              type="button"
              onClick={() => commit("")}
              className="w-full text-left px-3 py-2 text-xs text-dim hover:bg-surface-1"
            >
              — any skill —
            </button>
          )}
          {isCustom && (
            <button
              type="button"
              onClick={() => commit(query.trim())}
              className="w-full text-left px-3 py-2 text-xs border-b border-border hover:bg-phosphor hover:text-background"
            >
              ➕ use custom tag: <span className="text-phosphor">{query.trim()}</span>
            </button>
          )}
          {filtered.length === 0 && !isCustom && (
            <div className="px-3 py-2 text-xs text-dim">no matches</div>
          )}
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => commit(s)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-amber hover:text-background ${
                s === value ? "bg-surface-1 text-amber" : "text-foreground"
              }`}
            >
              {s}
              {inUse.includes(s) && (
                <span className="ml-2 text-[10px] text-dim">· in use</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
