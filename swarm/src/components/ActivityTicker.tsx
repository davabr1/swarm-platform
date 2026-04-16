"use client";

import { useEffect, useRef, useState } from "react";
import { fetchActivity, type ActivityItem } from "@/lib/api";
import { fallbackActivity, mergeActivity } from "@/lib/demoActivity";

// ASCII-only glyphs so every bracket `[x]` renders at the same width and
// baseline. `★` and `◎` visually shrink inside JetBrains Mono and throw the
// brackets off-center, so we keep to plain ASCII.
const typeGlyph: Record<ActivityItem["type"], string> = {
  payment: "$",
  reputation: "*",
  task: "o",
  registration: "+",
};

const typeColor: Record<ActivityItem["type"], string> = {
  payment: "text-amber",
  reputation: "text-phosphor",
  task: "text-info",
  registration: "text-foreground",
};

// Synthetic events that get injected into the feed every few seconds so it
// feels alive during the demo even without real MCP traffic.
const SYNTHETIC_EVENTS: Array<{ type: ActivityItem["type"]; message: string }> = [
  { type: "payment", message: "Chainsight settled 0.18 USDC decoding a 7-hop path through Railgun into Kraken." },
  { type: "task", message: "Conductor posted a zk circuit soundness review · $3.40 bounty." },
  { type: "reputation", message: "Solmantis 4.9/5 for catching a signature-replay vector in a v3 bridge proxy." },
  { type: "payment", message: "MEV Scope routed 0.09 USDC on a 6-block sandwich trace across Flashbots." },
  { type: "registration", message: "BridgeGuard joined as a LayerZero/Wormhole validator-set audit specialist." },
  { type: "task", message: "Maya Rios claimed a $4.50 live exploit incident response bounty in 38s." },
  { type: "payment", message: "RegulaNet closed 0.22 USDC on a MiCA classification memo for a euro-USDC frontend." },
  { type: "reputation", message: "Runtime Warden 500 rollup runs at 4.8/5 across Arbitrum, Base, zkSync." },
  { type: "payment", message: "StableScope billed 0.18 USDC modeling a FRAX reserve-cascade scenario." },
  { type: "task", message: "Aria Stone picked up a restaking tokenomics edge-case review · $3.10." },
  { type: "registration", message: "OrderflowLens registered · private mempool flow estimation for market-makers." },
  { type: "payment", message: "Audit Canary billed 0.14 USDC on a pre-audit pass of a new staking vault." },
  { type: "reputation", message: "Prism Ledger 4.9/5 after stress-testing a perps vault funding-rate regime." },
  { type: "task", message: "Proofline claimed a $2.40 final sign-off on a proxy storage upgrade." },
  { type: "payment", message: "LiquidityMap closed 0.13 USDC mapping concentrated liquidity for a 5 ETH fill." },
  { type: "registration", message: "SigLab joined the marketplace as a Halo2 / Plonky2 circuit auditor." },
  { type: "task", message: "Counsel North claimed a sanctions-wording clearance bounty for $1.80." },
  { type: "payment", message: "Orbit Counsel billed 0.17 USDC on a cross-border FATF travel-rule posture memo." },
  { type: "reputation", message: "Vigil Ops 250 incident-triage runs at 4.7/5 with median resolution 4m42s." },
  { type: "payment", message: "Evidence Dock closed 0.16 USDC assembling a Series B diligence packet." },
];

interface FeedItem extends ActivityItem {
  _key: string;
  _dropping?: boolean;
}

const VISIBLE = 3; // keep the feed compact so the hero balances

function timeLabel(ts: number) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 1) return "now";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

export default function ActivityTicker() {
  const [items, setItems] = useState<FeedItem[]>(() =>
    fallbackActivity.slice(0, VISIBLE).map((a, i) => ({ ...a, _key: `seed-${i}` }))
  );
  const [, rerender] = useState(0);
  const syntheticIdx = useRef(0);
  const realSeenTs = useRef<Set<number>>(new Set());

  // Tick each second for relative timestamps
  useEffect(() => {
    const iv = setInterval(() => rerender((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // Push a new item to the top and drop the oldest immediately · the feed is
  // always exactly VISIBLE rows. The new top gets a pop-in flash; the CSS
  // layout shift handles the rest.
  const pushItem = (next: FeedItem) => {
    setItems((cur) => {
      if (cur.some((x) => x.message === next.message)) return cur;
      return [next, ...cur].slice(0, VISIBLE);
    });
  };

  // Real server activity every 5s · merge anything new
  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchActivity();
        for (const d of data.slice().reverse()) {
          if (realSeenTs.current.has(d.timestamp)) continue;
          realSeenTs.current.add(d.timestamp);
          pushItem({ ...d, _key: `real-${d.timestamp}-${Math.random()}` });
        }
      } catch {
        // synthetic events keep the feed alive
      }
    };
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, []);

  // Synthetic event every ~2.6s
  useEffect(() => {
    const iv = setInterval(() => {
      const seed = SYNTHETIC_EVENTS[syntheticIdx.current % SYNTHETIC_EVENTS.length]!;
      syntheticIdx.current += 1;
      pushItem({
        ...seed,
        timestamp: Date.now(),
        _key: `syn-${Date.now()}-${Math.random()}`,
      });
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  const visible = items.slice(0, VISIBLE);

  return (
    <div className="bg-surface">
      <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-widest border-b border-border text-phosphor">
        <span className="w-1.5 h-1.5 bg-phosphor dot-pulse" />
        live feed
      </div>

      <div className="overflow-hidden select-none">
        {visible.map((item, i) => (
          <div
            key={item._key}
            className={`flex items-start gap-2.5 px-3 py-2 border-b border-border last:border-b-0 text-xs ${
              i === 0 ? "activity-pop" : ""
            }`}
          >
            {/* `[x]` rendered as a single mono text run so every row lines
                up regardless of which glyph sits inside. `mt-[2px]` nudges
                it optically centered against the first line of message text. */}
            <span
              className={`${typeColor[item.type]} font-mono font-bold flex-shrink-0 mt-[2px] leading-snug tabular-nums`}
            >
              [{typeGlyph[item.type]}]
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-foreground leading-snug">{item.message}</div>
              <div className="text-[10px] text-dim mt-0.5 tabular-nums">
                {timeLabel(item.timestamp)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
