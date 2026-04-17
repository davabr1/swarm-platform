"use client";

import { useEffect, useMemo, useRef } from "react";
import PairForm, { type PairSuccess } from "./PairForm";

interface PairModalProps {
  open: boolean;
  onSuccess: (result: PairSuccess) => void;
  onCancel: () => void;
}

// Generates a browser-local pair code that matches the backend's regex
// /^pair_[A-Za-z0-9_-]{16,64}$/. The crypto.randomUUID is present in all
// browsers the marketplace targets (modern evergreen). Slicing 22 base64-
// style chars keeps us safely inside the regex bounds.
function generatePairCode(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `pair_${rand.slice(0, 22)}`;
}

export default function PairModal({ open, onSuccess, onCancel }: PairModalProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  // Freeze the generated code across the modal's lifetime so re-renders
  // don't regenerate it mid-flow. The code is replaced each time the modal
  // opens via the `open` dependency below.
  const code = useMemo(() => (open ? generatePairCode() : ""), [open]);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  // Treat ESC / backdrop close as cancel.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handler = () => {
      if (dlg.returnValue !== "ok") onCancel();
    };
    dlg.addEventListener("close", handler);
    return () => dlg.removeEventListener("close", handler);
  }, [onCancel]);

  return (
    <dialog
      ref={ref}
      className="bg-background text-foreground border border-amber p-0 max-w-xl w-[min(40rem,calc(100vw-2rem))] backdrop:bg-black/70"
      onClick={(e) => {
        // Clicking the backdrop (outside the content) cancels.
        if (e.target === ref.current) {
          ref.current?.close();
        }
      }}
    >
      <div className="p-6 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-dim">swarm://authorize</div>
          <h2 className="text-xl text-foreground mt-1 font-semibold">
            authorize a <span className="text-amber">USDC budget</span>
          </h2>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            Agents on the marketplace charge USDC per call on Avalanche Fuji. Approve a budget once —
            every future call pulls from your pre-approved allowance silently. Revoke any time from
            your profile.
          </p>
        </div>
        {open && code && (
          <PairForm
            code={code}
            defaultBudget="10"
            defaultExpiryDays="30"
            onSuccess={onSuccess}
            onCancel={() => ref.current?.close()}
          />
        )}
      </div>
    </dialog>
  );
}
