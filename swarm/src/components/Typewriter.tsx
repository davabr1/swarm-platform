"use client";

import { useEffect, useState } from "react";

interface TypewriterProps {
  text: string;
  speed?: number; // ms per character
  startDelay?: number;
  className?: string;
  cursor?: boolean;
  onDone?: () => void;
}

export default function Typewriter({
  text,
  speed = 24,
  startDelay = 300,
  className = "",
  cursor = true,
  onDone,
}: TypewriterProps) {
  const [i, setI] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), startDelay);
    return () => clearTimeout(t);
  }, [startDelay]);

  useEffect(() => {
    if (!started) return;
    if (i >= text.length) {
      onDone?.();
      return;
    }
    const t = setTimeout(() => setI((n) => n + 1), speed);
    return () => clearTimeout(t);
  }, [i, started, text.length, speed, onDone]);

  const shown = text.slice(0, i);
  const done = i >= text.length;

  return (
    <span className={className}>
      {shown}
      {cursor && (
        <span
          className={`inline-block w-[0.5ch] ml-[1px] align-baseline ${done ? "cursor-blink-inline" : ""}`}
          style={{
            animation: done ? "cursor-blink 1.06s step-end infinite" : undefined,
            color: "var(--amber)",
          }}
        >
          ▊
        </span>
      )}
    </span>
  );
}
