"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { getMcpStatus } from "@/lib/api";

export default function StatusBar() {
  const pathname = usePathname();
  const isBlackFooter = pathname === "/" || pathname === "/about";
  const { address, isConnected } = useAccount();
  const [mcp, setMcp] = useState<"ready" | "down" | "checking">("checking");
  const [toolCount, setToolCount] = useState<number>(0);
  const [block, setBlock] = useState<number>(38_204_117);
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await getMcpStatus();
        if (!alive) return;
        setMcp(s.status === "ready" ? "ready" : "down");
        setToolCount(s.tools?.length ?? 0);
      } catch {
        if (!alive) return;
        setMcp("down");
      }
    };
    tick();
    const iv = setInterval(tick, 10_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      setBlock((b) => b + Math.floor(Math.random() * 3) + 1);
    }, 2_200);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      setTime(`${hh}:${mm}:${ss}`);
    };
    fmt();
    const iv = setInterval(fmt, 1000);
    return () => clearInterval(iv);
  }, []);

  const dot =
    mcp === "ready"
      ? "bg-phosphor"
      : mcp === "down"
      ? "bg-danger"
      : "bg-amber";

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-40 h-7 border-t border-border scanlines ${isBlackFooter ? "bg-background" : "bg-surface"}`}>
      <div className="h-full px-4 flex items-center justify-between text-[11px] text-muted gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-dim">net</span>
            <span className="text-amber">fuji</span>
          </span>
          <span className="text-dim">|</span>
          <span className="flex items-center gap-1.5">
            <span className="text-dim">mcp</span>
            <span className={`w-1.5 h-1.5 ${dot} dot-pulse`} />
            <span className={mcp === "ready" ? "text-phosphor" : mcp === "down" ? "text-danger" : "text-amber"}>
              {mcp}
            </span>
            {mcp === "ready" && toolCount > 0 && (
              <span className="text-dim">· {toolCount} tools</span>
            )}
          </span>
          <span className="text-dim">|</span>
          <span className="flex items-center gap-1.5">
            <span className="text-dim">blk</span>
            <span className="text-foreground tabular-nums">{block.toLocaleString()}</span>
          </span>
          <span className="text-dim hidden sm:inline">|</span>
          <span className="hidden sm:flex items-center gap-1.5">
            <span className="text-dim">wallet</span>
            <span className={isConnected ? "text-phosphor" : "text-dim"}>
              {isConnected && address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "disconnected"}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden md:inline text-dim">press <span className="text-foreground">⌘K</span> for cmd palette</span>
          <span className="text-dim">|</span>
          <span className="text-foreground tabular-nums">{time}</span>
        </div>
      </div>
    </div>
  );
}
