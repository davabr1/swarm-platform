"use client";

import { useRef, useState, type ReactNode } from "react";

interface TerminalWindowProps {
  title?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  dots?: boolean;
  subtitle?: string;
}

// Stoplight easter egg messages — roll a random one each click.
const RED_QUIPS = [
  "rm -rf / // kidding. kidding.",
  "error: vibes not found",
  "sudo make me a sandwich",
  "permission denied: you can't close the swarm",
  "(╯°□°)╯︵ ┻━┻",
  "signed,\n  ~ the builders ~",
];
const YELLOW_QUIPS = [
  "⚠ 3 more lines and we ship",
  "minimized. still working.",
  "task → agent → escalation → human",
  "brb — hiring another agent",
  "this window is too chill to minimize",
];
const GREEN_QUIPS = [
  "now full-screen in your heart",
  "it was already full-screen, bestie",
  "expanded consciousness achieved",
  "swarm maximized · vibes +1",
  "go outside ☀ (jk stay)",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export default function TerminalWindow({
  title,
  subtitle,
  children,
  className = "",
  bodyClassName = "",
  dots = true,
}: TerminalWindowProps) {
  const [toast, setToast] = useState<{ text: string; color: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (text: string, color: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, color });
    timer.current = setTimeout(() => setToast(null), 2200);
  };

  return (
    <div className={`border border-border bg-surface relative ${className}`}>
      {(title || dots) && (
        <div className="h-8 px-3 flex items-center gap-3 border-b border-border bg-surface-1">
          {dots && (
            <div className="flex items-center gap-1.5 group/stoplight">
              <button
                aria-label="close (don't worry)"
                onClick={() => flash(pick(RED_QUIPS), "#ff6a6a")}
                className="win-dot bg-[#2a2a30] group-hover/stoplight:bg-[#ff5f57] transition-colors cursor-pointer hover:scale-125"
              />
              <button
                aria-label="minimize (ha)"
                onClick={() => flash(pick(YELLOW_QUIPS), "#fbbf24")}
                className="win-dot bg-[#2a2a30] group-hover/stoplight:bg-[#febc2e] transition-colors cursor-pointer hover:scale-125"
              />
              <button
                aria-label="zoom (you're already here)"
                onClick={() => flash(pick(GREEN_QUIPS), "#7effa7")}
                className="win-dot bg-[#2a2a30] group-hover/stoplight:bg-[#28c840] transition-colors cursor-pointer hover:scale-125"
              />
            </div>
          )}
          {title && (
            <div className="flex-1 flex items-center gap-2 text-[11px] text-muted tracking-wide min-w-0">
              <span className="truncate">{title}</span>
              {subtitle && <span className="text-dim truncate">· {subtitle}</span>}
            </div>
          )}
        </div>
      )}
      <div className={`${bodyClassName}`}>{children}</div>

      {toast && (
        <div
          className="absolute top-10 left-3 z-20 border bg-background px-2.5 py-1 text-[11px] font-mono whitespace-pre animate-fade-up"
          style={{ borderColor: toast.color, color: toast.color }}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
