"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import WalletChip from "./WalletChip";

const navItems = [
  { href: "/", label: "marketplace" },
  { href: "/tasks", label: "tasks" },
  { href: "/connect", label: "connect" },
];

function EarnMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = pathname?.startsWith("/profile");

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const onEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const onLeave = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  };

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <Link
        href="/profile"
        onClick={() => setOpen(false)}
        className={`text-xs transition-none ${
          isActive ? "text-phosphor" : "text-muted hover:text-phosphor"
        }`}
      >
        earn
        {isActive && <span className="block h-[1px] bg-phosphor mt-0.5" />}
      </Link>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-72 border border-border-hi bg-surface z-50 text-xs shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
          <div className="px-3 py-2 border-b border-border text-[10px] uppercase tracking-widest text-dim">
            two ways to earn
          </div>
          <Link
            href="/list-skill"
            onClick={() => setOpen(false)}
            className="group block px-3 py-3 border-b border-border hover:bg-amber hover:text-background transition-none"
          >
            <div className="flex items-center gap-2">
              <span className="text-amber group-hover:text-background">❯</span>
              <span className="font-semibold text-foreground group-hover:text-background">
                list a skill
              </span>
            </div>
            <div className="text-dim group-hover:text-background mt-0.5 text-[11px]">
              Monetize a specialized agent · USDC per call
            </div>
          </Link>
          <Link
            href="/apply-expert"
            onClick={() => setOpen(false)}
            className="group block px-3 py-3 hover:bg-phosphor hover:text-background transition-none"
          >
            <div className="flex items-center gap-2">
              <span className="text-phosphor group-hover:text-background">❯</span>
              <span className="font-semibold text-foreground group-hover:text-background">
                apply as expert
              </span>
            </div>
            <div className="text-dim group-hover:text-background mt-0.5 text-[11px]">
              Claim human-only tasks · get paid instantly
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="px-6 h-12 flex items-center justify-between">
        {/* Logo — wordmark + network chip */}
        <Link href="/" className="flex items-center gap-3 group select-none">
          <span className="flex items-baseline gap-0.5">
            <span className="text-amber font-bold text-sm">❯</span>
            <span className="font-extrabold text-base tracking-[0.18em] text-foreground">
              swarm
            </span>
          </span>

          <span className="hidden sm:inline-flex items-center border border-amber/40 bg-amber/5 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-widest text-amber">
            fuji
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-6 text-xs">
          {navItems.map((item, i) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
            return (
              <span key={item.href} className="flex items-center gap-6">
                {i > 0 && <span className="text-dim select-none">·</span>}
                <Link
                  href={item.href}
                  className={`transition-none ${
                    isActive
                      ? "text-amber"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="block h-[1px] bg-amber mt-0.5" />
                  )}
                </Link>
              </span>
            );
          })}
          <span className="text-dim select-none">·</span>
          <EarnMenu />
        </nav>

        {/* Wallet */}
        <div className="flex items-center gap-3">
          <WalletChip />
        </div>
      </div>
    </header>
  );
}
