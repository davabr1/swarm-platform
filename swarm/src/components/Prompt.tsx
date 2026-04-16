"use client";

import { forwardRef, type TextareaHTMLAttributes, type InputHTMLAttributes } from "react";

interface PromptTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  glyph?: string;
}

export const PromptTextarea = forwardRef<HTMLTextAreaElement, PromptTextareaProps>(
  function PromptTextarea({ glyph = "❯", className = "", ...props }, ref) {
    return (
      <div className={`border border-border bg-surface-1 focus-within:border-amber flex ${className}`}>
        <span className="pl-3 pt-3 text-amber text-sm select-none">{glyph}</span>
        <textarea
          ref={ref}
          {...props}
          className="flex-1 bg-transparent p-3 pl-2 text-sm text-foreground placeholder:text-dim focus:outline-none focus-visible:outline-none resize-none font-mono leading-relaxed"
        />
      </div>
    );
  }
);

interface PromptInputProps extends InputHTMLAttributes<HTMLInputElement> {
  glyph?: string;
  prefix?: string;
}

export const PromptInput = forwardRef<HTMLInputElement, PromptInputProps>(
  function PromptInput({ glyph = "❯", prefix, className = "", ...props }, ref) {
    return (
      <div className={`border border-border bg-surface-1 focus-within:border-amber flex items-center ${className}`}>
        <span className="pl-3 text-amber text-sm select-none">{glyph}</span>
        {prefix && <span className="pl-2 text-dim text-sm">{prefix}</span>}
        <input
          ref={ref}
          {...props}
          className="flex-1 bg-transparent px-2 py-2.5 text-sm text-foreground placeholder:text-dim focus:outline-none focus-visible:outline-none font-mono"
        />
      </div>
    );
  }
);
