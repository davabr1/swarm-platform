"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import WalletChip from "./WalletChip";
import { CHEVRON_MASCOT, SWARM_ART } from "./BootSplash";

const navItems = [
  { href: "/marketplace", label: "marketplace" },
  { href: "/tasks", label: "tasks" },
  { href: "/configure", label: "configure" },
];

function EarnMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive =
    pathname?.startsWith("/list-skill") || pathname?.startsWith("/apply-expert");

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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`text-xs transition-none cursor-pointer ${
          isActive ? "text-phosphor" : "text-muted hover:text-phosphor"
        }`}
      >
        earn
        {isActive && <span className="block h-[1px] bg-phosphor mt-0.5" />}
      </button>
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
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Triple-click on the SWARM logo within 1500ms opens the hidden admin
  // gate. Single click still navigates home via the Link default.
  const logoClicks = useRef<number[]>([]);
  const onLogoClick = (e: React.MouseEvent) => {
    const now = Date.now();
    logoClicks.current = [...logoClicks.current.filter((t) => now - t < 1500), now];
    if (logoClicks.current.length >= 3) {
      e.preventDefault();
      logoClicks.current = [];
      router.push("/admin");
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="px-6 h-12 grid grid-cols-[1fr_auto_1fr] items-center">
        {/* Logo — same pixel ❯ + SWARM figlet as the boot splash, shrunk
            to fit the 48px header. Courier New keeps the box-drawing
            chars flush with the █ blocks. */}
        <Link
          href="/"
          onClick={onLogoClick}
          className="flex items-center gap-3 group select-none justify-self-start"
        >
          <div className="flex items-center gap-1">
            <pre
              className={`leading-[3px] whitespace-pre font-bold m-0 ${
                pathname === "/"
                  ? "text-amber"
                  : "text-foreground group-hover:text-amber"
              }`}
              style={{
                fontFamily: "'Courier New', Courier, monospace",
                fontSize: "3px",
              }}
            >
              {CHEVRON_MASCOT}
            </pre>
            <pre
              className="text-foreground leading-[3px] whitespace-pre font-bold m-0 translate-y-[1px]"
              style={{
                fontFamily: "'Courier New', Courier, monospace",
                fontSize: "3px",
              }}
            >
              {SWARM_ART}
            </pre>
          </div>

          <span
            className={`hidden sm:inline-flex items-center border px-1.5 py-0.5 text-[10px] font-mono normal-case tracking-widest transition-none ${
              pathname === "/"
                ? "border-amber/40 bg-amber/5 text-amber"
                : "border-border-hi text-foreground hover:border-amber/40 hover:bg-amber/5 hover:text-amber group-hover:border-amber/40 group-hover:bg-amber/5 group-hover:text-amber"
            }`}
          >
            x402
          </span>
        </Link>

        {/* Navigation — desktop */}
        <nav className="hidden md:flex items-center gap-6 text-xs justify-self-center">
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
          <span className="text-dim select-none">·</span>
          <Link
            href="/about"
            className={`transition-none ${
              pathname?.startsWith("/about")
                ? "text-amber"
                : "text-muted hover:text-foreground"
            }`}
          >
            about
            {pathname?.startsWith("/about") && (
              <span className="block h-[1px] bg-amber mt-0.5" />
            )}
          </Link>
        </nav>

        {/* Hamburger — mobile only */}
        <button
          type="button"
          aria-label={mobileOpen ? "close menu" : "open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden justify-self-center inline-flex items-center justify-center w-9 h-9 border border-border-hi text-foreground hover:border-amber hover:text-amber transition-none"
        >
          {mobileOpen ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          ) : (
            <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
              <path d="M0 1 H16 M0 6 H16 M0 11 H16" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          )}
        </button>

        {/* Wallet */}
        <div className="flex items-center gap-3 justify-self-end">
          <WalletChip />
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-border bg-background text-sm">
          {navItems.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`block px-6 py-3 border-b border-border transition-none ${
                  isActive ? "text-amber" : "text-foreground hover:text-amber"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/list-skill"
            onClick={() => setMobileOpen(false)}
            className={`block px-6 py-3 border-b border-border transition-none ${
              pathname?.startsWith("/list-skill")
                ? "text-amber"
                : "text-foreground hover:text-amber"
            }`}
          >
            list a skill
          </Link>
          <Link
            href="/apply-expert"
            onClick={() => setMobileOpen(false)}
            className={`block px-6 py-3 border-b border-border transition-none ${
              pathname?.startsWith("/apply-expert")
                ? "text-phosphor"
                : "text-foreground hover:text-phosphor"
            }`}
          >
            apply as expert
          </Link>
          <Link
            href="/about"
            onClick={() => setMobileOpen(false)}
            className={`block px-6 py-3 transition-none ${
              pathname?.startsWith("/about")
                ? "text-amber"
                : "text-foreground hover:text-amber"
            }`}
          >
            about
          </Link>
        </nav>
      )}
    </header>
  );
}
