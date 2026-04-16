"use client";

import { useState } from "react";

interface CopyChipProps {
  value: string;
  display?: string;
  className?: string;
  compact?: boolean;
}

export default function CopyChip({ value, display, className = "", compact = false }: CopyChipProps) {
  const [flashing, setFlashing] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setFlashing(true);
      setTimeout(() => setFlashing(false), 500);
    } catch {
      // ignore
    }
  };

  const label = display ?? value;

  if (compact) {
    return (
      <button
        onClick={copy}
        className={`inline-flex items-center gap-1.5 text-xs font-mono text-muted hover:text-amber transition-none ${
          flashing ? "flash-green" : ""
        } ${className}`}
      >
        <span>{label}</span>
        <span className={flashing ? "text-phosphor" : "text-amber/80"}>{flashing ? "✓" : "⎘"}</span>
      </button>
    );
  }

  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-2 px-2 py-1 border border-border bg-surface-1 text-xs font-mono text-foreground hover:border-amber hover:text-amber transition-none ${
        flashing ? "flash-green" : ""
      } ${className}`}
    >
      <span className="truncate">{label}</span>
      <span className={`flex-shrink-0 ${flashing ? "text-phosphor" : "text-amber/80"}`}>
        {flashing ? "✓ copied" : "⎘ copy"}
      </span>
    </button>
  );
}
