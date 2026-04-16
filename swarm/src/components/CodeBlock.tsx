"use client";

import { useState, type ReactNode } from "react";

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  title?: ReactNode;
  maxHeight?: string;
}

/**
 * CodeBlock · clean copyable code without the mac stoplight dots. Used for
 * the connect page and any other docs-style code samples. Keeps the site's
 * terminal theming (1px border, surface bg) but reads as documentation code,
 * not a pretend terminal window.
 */
export default function CodeBlock({
  code,
  language,
  filename,
  title,
  maxHeight = "420px",
}: CodeBlockProps) {
  const [flashing, setFlashing] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setFlashing(true);
      setTimeout(() => setFlashing(false), 500);
    } catch {
      // ignore
    }
  };

  const headerText = title ?? filename;

  return (
    <div className="border border-border bg-surface overflow-hidden">
      {(headerText || language) && (
        <div className="h-9 px-3 flex items-center justify-between border-b border-border bg-surface-1 text-[11px] font-mono text-muted">
          <div className="flex items-center gap-3 min-w-0 truncate">
            {headerText && <span className="truncate">{headerText}</span>}
            {language && (
              <span className="text-dim uppercase tracking-widest text-[10px]">
                {language}
              </span>
            )}
          </div>
          <button
            onClick={copy}
            className={`text-[11px] uppercase tracking-widest transition-none ${
              flashing ? "text-phosphor" : "text-dim hover:text-amber"
            }`}
          >
            {flashing ? "✓ copied" : "[ copy ]"}
          </button>
        </div>
      )}
      <pre
        className="p-4 text-xs leading-relaxed text-foreground overflow-auto bg-background"
        style={{ maxHeight }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
