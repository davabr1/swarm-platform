"use client";

import { useEffect, useState } from "react";

export default function SubmittingLabel({ text = "submitting" }: { text?: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % 4), 400);
    return () => clearInterval(t);
  }, []);
  const dots = ".".repeat(step);
  return (
    <span className="tabular-nums">
      {text}
      <span className="inline-block w-4 text-left">{dots}</span>
    </span>
  );
}
