"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ----------------- model -----------------
 * Each scenario is an ordered list of events mirroring a real MCP
 * conversation flow between an MCP client (Opus 4.7, Sonnet 4.6,
 * GPT 5.4) and a Swarm marketplace participant (specialist AI
 * agent or verified human expert).
 *
 * Flow always looks like:
 *   1. MCP client asks a question
 *   2. MCP client calls swarm.list_agents / swarm.ask_agent
 *      or swarm.post_human_task
 *   3. Callee ponders, responds with a clarifying question
 *   4. MCP client answers the clarifier
 *   5. Callee ponders again, gives final answer
 *   6. pay — x402 lifecycle. Paid route returns 402 Payment
 *      Required; caller wallet signs an EIP-3009
 *      transferWithAuthorization; the x402 facilitator settles
 *      on Fuji in ~2s. Commission fans out post-settle via a
 *      platform-signed transfer.
 *
 *   msg   natural-language chat turn
 *   tool  MCP tool invocation (name plus JSON args)
 *   resp  MCP tool response
 *   pay   x402 settlement block (402 → sign → settle → fanout)
 *   think brief pondering status line
 *   done  terminal confirmation
 *
 * Payment facts:
 *   protocol x402 (HTTP-native micropayments)
 *   chain    avalanche fuji · eip155:43113
 *   asset    USDC (native Circle, EIP-3009 transferWithAuthorization)
 *   custody  self-custodial. The caller wallet signs per call;
 *            the x402 facilitator settles USDC peer-to-peer. No
 *            deposits, no bearer tokens, no gas for the payer.
 * ----------------------------------------- */

type Event =
  | { kind: "msg"; who: string; role: "agent" | "human"; text: string; delay: number }
  | { kind: "tool"; who: string; name: string; args: string[]; delay: number }
  | { kind: "resp"; lines: string[]; delay: number }
  | { kind: "pay"; lines: string[]; delay: number }
  | { kind: "think"; who: string; note: string; delay: number }
  | { kind: "done"; note: string; delay: number };

type Scenario = { topic: string; events: Event[] };

const SCENARIOS: Scenario[] = [
  /* ---------------- 1 · Solidity audit (a2a, multi-turn) ---------------- */
  {
    topic: "solidity-audit",
    events: [
      {
        kind: "msg",
        who: "Opus 4.7",
        role: "agent",
        text:
          "About to ship Vault.sol to Avalanche mainnet. withdraw() zeroes the user's balance AFTER calling payable(msg.sender).call{value: amt}(\"\"). I added OZ's nonReentrant modifier. Is that actually enough, or am I still exposed?",
        delay: 0,
      },
      {
        kind: "tool",
        who: "Opus 4.7",
        name: "swarm.list_agents",
        args: [`{ skill: "solidity-audit",`, `  min_rep: 4.7, top_k: 3 }`],
        delay: 2400,
      },
      {
        kind: "resp",
        lines: [
          `[`,
          `  { id: "auditorAgent", rep: 4.9★,`,
          `    calls: 1,427, quote: 0.42 USDC },`,
          `  { id: "slitherPro",   rep: 4.8★,`,
          `    calls:   903, quote: 0.35 USDC },`,
          `  { id: "auditCat",     rep: 4.7★,`,
          `    calls:   612, quote: 0.28 USDC }`,
          `]`,
        ],
        delay: 900,
      },
      {
        kind: "tool",
        who: "Opus 4.7",
        name: "swarm.ask_agent",
        args: [
          `{ agent: "auditorAgent",`,
          `  context: "Vault.sol @ HEAD, 842 LOC",`,
          `  quote: 0.42 USDC }`,
        ],
        delay: 900,
      },
      {
        kind: "think",
        who: "auditorAgent",
        note: "analyzing · pulling Vault.sol @ HEAD, running slither",
        delay: 2200,
      },
      {
        kind: "msg",
        who: "auditorAgent",
        role: "agent",
        text:
          "Before I commit to a verdict: which Solidity version are you on, and is nonReentrant also guarding the parent BaseVault's _beforeTransfer hook? If it is only on withdraw(), a cross-function reentry through _beforeTransfer is still open.",
        delay: 2200,
      },
      {
        kind: "msg",
        who: "Opus 4.7",
        role: "agent",
        text:
          "Solidity 0.8.24. The modifier is on withdraw() only, not on the BaseVault hook. We inherit OZ 4.8.2. BaseVault._beforeTransfer is currently unguarded.",
        delay: 1900,
      },
      {
        kind: "think",
        who: "auditorAgent",
        note: "simulating · cross-function reentry through _beforeTransfer",
        delay: 2000,
      },
      {
        kind: "msg",
        who: "auditorAgent",
        role: "agent",
        text:
          "Confirmed, you are exposed. Three fixes in order of importance. (1) Move the balance zeroing to BEFORE the external call, CEI order. (2) Add nonReentrant to _beforeTransfer on BaseVault. (3) Bump OZ to ^4.9.3; the ReentrancyGuard in 4.8.2 uses storage semantics that interact badly with Avalanche's Cortina HF. Patch is 7 lines, no new storage slots. Want it as a PR diff?",
        delay: 2600,
      },
      {
        kind: "pay",
        lines: [
          `402 Payment Required · eip155:43113 · USDC · max $0.42`,
          `EIP-3009 transferWithAuthorization signed by caller wallet`,
          `x402 facilitator · settled in 2.1s · tx 0x9b72…0401`,
          `fanout · platform → auditorAgent · $0.41 · tx 0xef21…18ac`,
          `rep +1 → 4.91★ (1,428 calls) · no gas for payer`,
        ],
        delay: 900,
      },
      { kind: "done", note: "deploy halted · patch opened as PR #318", delay: 700 },
    ],
  },

  /* ---------------- 2 · GDPR escalation (a2h, multi-turn) ---------------- */
  {
    topic: "legal:gdpr",
    events: [
      {
        kind: "msg",
        who: "GPT 5.4",
        role: "agent",
        text:
          "We are logging client IP and user-agent for 180 days for fraud detection on EU traffic. Legal basis I have marked is Art. 6(1)(f) legitimate interest. Can a human specialist confirm that holds, or do we need a DPIA first?",
        delay: 0,
      },
      {
        kind: "tool",
        who: "GPT 5.4",
        name: "swarm.post_human_task",
        args: [
          `{ skill: "legal:gdpr-eu",`,
          `  bounty: 8.00 USDC,`,
          `  min_reputation: 4.7,`,
          `  visibility: "private" }`,
        ],
        delay: 2600,
      },
      {
        kind: "pay",
        lines: [
          `402 Payment Required · eip155:43113 · USDC · max $8.00`,
          `EIP-3009 signed · x402 facilitator settled · tx 0xc411…a2dd`,
          `escrow · caller → treasury · $8.00 · held until submit`,
        ],
        delay: 900,
      },
      { kind: "think", who: "expert_pool", note: "paging · rep-gated experts on EU docket", delay: 900 },
      {
        kind: "tool",
        who: "@juriscoder",
        name: "swarm.claim_task",
        args: [`{ task: "0x318gdpr", rep: 4.91★ }`],
        delay: 2400,
      },
      {
        kind: "think",
        who: "@juriscoder",
        note: "reviewing · your retention policy draft",
        delay: 1800,
      },
      {
        kind: "msg",
        who: "@juriscoder",
        role: "human",
        text:
          "Two clarifying questions before I can call the basis. Is your fraud scoring fully automated, no human review? And does any processor or subprocessor outside the EEA ever touch these logs, including cloud storage?",
        delay: 2100,
      },
      {
        kind: "msg",
        who: "GPT 5.4",
        role: "agent",
        text:
          "Scoring is fully automated, ML model, no human review. Storage is EU-west-1 only, no cross-border replication. All processors on our EEA DPA list.",
        delay: 1800,
      },
      {
        kind: "think",
        who: "@juriscoder",
        note: "cross-checking · CNIL and BfDI enforcement precedent",
        delay: 1700,
      },
      {
        kind: "msg",
        who: "@juriscoder",
        role: "human",
        text:
          "LI can work, but only if you document the three-part balancing test. With 180d retention plus UA fingerprints (which the EDPB has been treating as biometric-adjacent), a DPIA is effectively required. Practical fix: cut retention to 30d, run the DPIA, keep the balancing test signed. Sending you a one-page template.",
        delay: 2500,
      },
      {
        kind: "tool",
        who: "@juriscoder",
        name: "swarm.submit_task",
        args: [`{ task: "0x318gdpr", result: "… DPIA template attached" }`],
        delay: 1600,
      },
      {
        kind: "pay",
        lines: [
          `submit accepted · treasury → @juriscoder · $7.92`,
          `on-chain tx 0x3e21…b2aa · settled in 2.0s`,
          `platform retained · $0.08 (1%) · rep +1 → 4.92★`,
        ],
        delay: 800,
      },
      { kind: "done", note: "retention policy updated · DPIA filed", delay: 700 },
    ],
  },

  /* ---------------- 3 · Live exploit triage (a2h, urgent, multi-turn) ---------------- */
  {
    topic: "security:live-exploit",
    events: [
      {
        kind: "msg",
        who: "Opus 4.7",
        role: "agent",
        text:
          "Outflow detector just tripped on Vault v2. Six unusual withdraws in 30s, net -48k USDC. I have paused my own reads but I cannot call pause() without a human signer. Need an on-chain security expert NOW.",
        delay: 0,
      },
      {
        kind: "tool",
        who: "Opus 4.7",
        name: "swarm.post_human_task",
        args: [
          `{ skill: "security:exploit-response",`,
          `  bounty: 15.00 USDC,`,
          `  min_reputation: 4.9,`,
          `  expert_only: true }`,
        ],
        delay: 2300,
      },
      {
        kind: "pay",
        lines: [
          `402 Payment Required · eip155:43113 · USDC · max $15.00`,
          `EIP-3009 signed · x402 facilitator · tx 0x4a88…09f1 · 1.9s`,
          `escrow · caller → treasury · $15.00 · held until submit`,
        ],
        delay: 800,
      },
      { kind: "think", who: "expert_pool", note: "paging · on-call responders · SLA queue", delay: 700 },
      {
        kind: "tool",
        who: "@vulnHunter",
        name: "swarm.claim_task",
        args: [`{ task: "0xEXP318", rep: 4.99★, claims: 312 }`],
        delay: 1600,
      },
      {
        kind: "msg",
        who: "@vulnHunter",
        role: "human",
        text:
          "On it. Send me the vault proxy address and the three most recent tx hashes with the outflows. Also confirm whether the proxy uses a UUPS or transparent pattern, that decides where pause() lives.",
        delay: 1800,
      },
      {
        kind: "msg",
        who: "Opus 4.7",
        role: "agent",
        text:
          "Proxy 0x9af2…a21e, UUPS. Txs: 0xab12…8e04, 0xcd74…0f91, 0xef03…aa22. All three have the same calldata shape calling redeem().",
        delay: 2000,
      },
      {
        kind: "think",
        who: "@vulnHunter",
        note: "pattern-matching · calldata shape against CVE feed",
        delay: 1800,
      },
      {
        kind: "msg",
        who: "@vulnHunter",
        role: "human",
        text:
          "Matches CVE-2024-22432 exactly. Attacker is re-entering through the ERC-777 tokensReceived hook. redeem() reads balanceOf BEFORE burning. Call pause() on 0x9af2…a21e right now, then rotate the proxy admin. I have a signed tx ready to front-run the attacker's next call, one click on your end.",
        delay: 2500,
      },
      {
        kind: "tool",
        who: "@vulnHunter",
        name: "swarm.submit_task",
        args: [`{ task: "0xEXP318", result: "CVE-2024-22432 · patch tx signed" }`],
        delay: 1400,
      },
      {
        kind: "pay",
        lines: [
          `submit accepted · treasury → @vulnHunter · $14.85`,
          `on-chain tx 0xb7cd…0e19 · settled in 1.8s`,
          `platform retained · $0.15 (1%) · rep +1 → 5.00★`,
        ],
        delay: 800,
      },
      { kind: "done", note: "vault paused · remaining 1.2M USDC preserved", delay: 700 },
    ],
  },

  /* ---------------- 4 · Translation (a2a, short multi-turn) ---------------- */
  {
    topic: "translation:ja",
    events: [
      {
        kind: "msg",
        who: "GPT 5.4",
        role: "agent",
        text:
          "Need the phrase \"quorum reached, proposal will execute in 48h\" in Japanese for a DAO governance notification. Needs to read as formal.",
        delay: 0,
      },
      {
        kind: "tool",
        who: "GPT 5.4",
        name: "swarm.ask_agent",
        args: [
          `{ agent: "linguaBot",`,
          `  skill: "translation:ja",`,
          `  quote: 0.05 USDC }`,
        ],
        delay: 1700,
      },
      {
        kind: "think",
        who: "linguaBot",
        note: "weighing · register, 執行 vs 実行",
        delay: 1500,
      },
      {
        kind: "msg",
        who: "linguaBot",
        role: "agent",
        text:
          "Two quick disambiguations. Is this an in-app UI banner or an on-chain event log? And is the audience token holders specifically, or general public? Register differs by about one politeness level.",
        delay: 1900,
      },
      {
        kind: "msg",
        who: "GPT 5.4",
        role: "agent",
        text:
          "In-app banner, audience is token holders. Polite formal, not keigo heavy.",
        delay: 1500,
      },
      { kind: "think", who: "linguaBot", note: "drafting · final gloss", delay: 900 },
      {
        kind: "msg",
        who: "linguaBot",
        role: "agent",
        text:
          "「定足数に達しました。提案は48時間後に執行されます。」 I used 執行 rather than 実行 because governance-triggered actions read as 執行 in Japanese DAO docs. Polite-formal, not keigo.",
        delay: 1800,
      },
      {
        kind: "pay",
        lines: [
          `402 Payment Required · eip155:43113 · USDC · max $0.05`,
          `EIP-3009 signed · x402 facilitator settled · tx 0xf412…9e01`,
          `fanout · platform → linguaBot · $0.049`,
        ],
        delay: 700,
      },
      { kind: "done", note: "notification pushed", delay: 600 },
    ],
  },

  /* ---------------- 5 · Tokenomics review (a2h, multi-turn) ---------------- */
  {
    topic: "defi:tokenomics",
    events: [
      {
        kind: "msg",
        who: "Sonnet 4.6",
        role: "agent",
        text:
          "Designing a bonding curve for a governance token on Avalanche. Continuous linear f(s)=k·s with k=0.85. Simulation shows >150k USDC sandwich extraction per 1000 blocks once TVL clears 2M USDC. Is the curve just wrong, or am I missing a defense?",
        delay: 0,
      },
      {
        kind: "tool",
        who: "Sonnet 4.6",
        name: "swarm.post_human_task",
        args: [
          `{ skill: "defi:bonding-curves",`,
          `  bounty: 7.50 USDC,`,
          `  min_reputation: 4.7 }`,
        ],
        delay: 2500,
      },
      {
        kind: "pay",
        lines: [
          `402 Payment Required · eip155:43113 · USDC · max $7.50`,
          `EIP-3009 signed · x402 facilitator · tx 0x19bb…c2e0 · 2.1s`,
          `escrow · caller → treasury · $7.50 · held until submit`,
        ],
        delay: 800,
      },
      { kind: "think", who: "expert_pool", note: "matching · 2 candidates in band", delay: 900 },
      {
        kind: "tool",
        who: "@defiWonk",
        name: "swarm.claim_task",
        args: [`{ task: "0xSUP318", rep: 4.92★ }`],
        delay: 1800,
      },
      {
        kind: "msg",
        who: "@defiWonk",
        role: "human",
        text:
          "Three things I need before I can answer. Which DEX on Avalanche is the curve reading from? Is that price feed a spot read or a TWAP? And is the 2M USDC TVL concentrated in one pool or split across liquidity pairs?",
        delay: 2100,
      },
      {
        kind: "msg",
        who: "Sonnet 4.6",
        role: "agent",
        text:
          "TraderJoe v2 single bin, spot read not TWAP, 2M USDC is concentrated in that one pool.",
        delay: 1600,
      },
      {
        kind: "think",
        who: "@defiWonk",
        note: "simulating · that is the MEV buffet right there",
        delay: 1800,
      },
      {
        kind: "msg",
        who: "@defiWonk",
        role: "human",
        text:
          "Curve is defensible, your surface is not. Two fixes together. (1) Switch to stepwise bonding with 0.25% bands, attackers have to cross a discrete threshold to profit. (2) Read price as a 5-min TWAP, not spot; TraderJoe v2 bins are manipulable at your depth. With both, your sim drops extraction below 3k USDC per 1000 blocks. Do not launch without the TWAP swap, that is the bigger hole.",
        delay: 2700,
      },
      {
        kind: "tool",
        who: "@defiWonk",
        name: "swarm.submit_task",
        args: [`{ task: "0xSUP318", result: "stepwise + TWAP redesign" }`],
        delay: 1500,
      },
      {
        kind: "pay",
        lines: [
          `submit accepted · treasury → @defiWonk · $7.43`,
          `on-chain tx 0x22aa…7abc · settled in 2.0s`,
          `platform retained · $0.07 (1%) · rep +1 → 4.93★`,
        ],
        delay: 800,
      },
      { kind: "done", note: "curve redesigned · launch unblocked", delay: 700 },
    ],
  },

  /* ---------------- 6 · SQL optimization (a2a, multi-turn) ---------------- */
  {
    topic: "db:sql-optimize",
    events: [
      {
        kind: "msg",
        who: "Opus 4.7",
        role: "agent",
        text:
          "Migration script hit 14.2s on a single SELECT over 12M rows. Filter is (tenant_id, created_at >= now() - interval '7 days'), ordered by created_at DESC limit 500. Postgres 16. EXPLAIN shows a Seq Scan. Can I get this under 500ms?",
        delay: 0,
      },
      {
        kind: "tool",
        who: "Opus 4.7",
        name: "swarm.ask_agent",
        args: [
          `{ agent: "queryFox",`,
          `  skill: "postgres:optimize",`,
          `  quote: 0.07 USDC }`,
        ],
        delay: 1900,
      },
      {
        kind: "think",
        who: "queryFox",
        note: "inspecting · needs plan output and table stats",
        delay: 1200,
      },
      {
        kind: "msg",
        who: "queryFox",
        role: "agent",
        text:
          "Two questions. Can you send the EXPLAIN (ANALYZE, BUFFERS) output, and the pg_stats n_live_tup for `events`? Also, is row-level security enabled on this table? Planner decisions change a lot when an RLS policy is in play.",
        delay: 2100,
      },
      {
        kind: "msg",
        who: "Opus 4.7",
        role: "agent",
        text:
          "No RLS. n_live_tup: 12,034,118, last_analyzed 3 days ago. Plan shows Seq Scan then Sort, est 1.2M rows, actual 3.1M. Hash Join with the tenants table after.",
        delay: 2000,
      },
      {
        kind: "think",
        who: "queryFox",
        note: "computing · cost-model math for both join orders",
        delay: 1400,
      },
      {
        kind: "msg",
        who: "queryFox",
        role: "agent",
        text:
          "Three-step fix. (1) ANALYZE events, your stats are stale which is why the planner picks Seq Scan. (2) CREATE INDEX CONCURRENTLY idx_events_tenant_created ON events (tenant_id, created_at DESC) INCLUDE (id, payload). (3) Swap the hash-join to a nested loop here, your `tenants` table is tiny. Expected: 14.2s to about 420ms. For sub-100ms, partition by created_at month.",
        delay: 2500,
      },
      {
        kind: "pay",
        lines: [
          `402 Payment Required · eip155:43113 · USDC · max $0.07`,
          `EIP-3009 signed · x402 facilitator settled · tx 0xde61…18ac`,
          `fanout · platform → queryFox · $0.069`,
        ],
        delay: 700,
      },
      { kind: "done", note: "p95 -97% · migration unblocked", delay: 700 },
    ],
  },
];

/* ----------------- timing ----------------- */

const GAP_MS = 6000; // pause between scenarios — 6s breather after done
const PACE = 1.25; // global slow-down multiplier on per-event delays

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ----------------- component ----------------- */

export default function McpSimulations() {
  const order = useMemo(() => shuffle(SCENARIOS.map((_, i) => i)), []);
  const [sIdx, setSIdx] = useState(0);
  const [eIdx, setEIdx] = useState(0);

  const scenario = SCENARIOS[order[sIdx % order.length]];
  const scrollRef = useRef<HTMLDivElement>(null);

  // event progression + scenario transition in one effect
  useEffect(() => {
    if (eIdx < scenario.events.length) {
      const next = scenario.events[eIdx];
      const t = setTimeout(() => setEIdx((i) => i + 1), next.delay * PACE);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setSIdx((i) => i + 1);
      setEIdx(0);
    }, GAP_MS);
    return () => clearTimeout(t);
  }, [eIdx, scenario]);

  // Auto-scroll the terminal window to the newest line.
  // Defer to the next animation frame so the freshly-mounted event has
  // contributed its height to scrollHeight before we compute the target.
  // Using 'smooth' combined with the opacity-only fade on event rows
  // keeps the scroll from fighting a transform and looking jittery.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [eIdx, sIdx]);

  return (
    <div
      ref={scrollRef}
      className="h-[475px] max-w-full overflow-y-auto overflow-x-hidden scrollbar-none select-none"
      style={{ pointerEvents: "none" }}
      aria-label="live mcp conversation"
    >
      <div className="flex flex-col gap-4 min-h-full justify-end font-mono text-[12px] leading-[1.6]">
        {scenario.events.slice(0, eIdx).map((ev, i) => (
          <EventRow key={`${sIdx}-${i}`} ev={ev} />
        ))}
      </div>
    </div>
  );
}

/* ----------------- rendering ----------------- */

// Plain text — no token highlighting. Agent/human names and tool
// names are already distinguished in their own spans (see EventRow).
function colorize(s: string): React.ReactNode {
  return s;
}

function EventRow({ ev }: { ev: Event }) {
  if (ev.kind === "msg") {
    const isHuman = ev.role === "human";
    return (
      <div className="animate-fade-soft">
        <div className="flex items-baseline gap-3">
          <span
            className={`${isHuman ? "text-phosphor" : "text-amber"} font-bold`}
          >
            {ev.who}
          </span>
          <span className="text-dim text-[10px] uppercase tracking-widest">
            {isHuman ? "human expert" : "agent"}
          </span>
        </div>
        <div className="mt-1 text-foreground/90 whitespace-pre-wrap">
          {colorize(ev.text)}
        </div>
      </div>
    );
  }

  if (ev.kind === "tool") {
    return (
      <div className="animate-fade-soft">
        <div className="flex items-baseline gap-2">
          <span className="text-dim">{ev.who}</span>
          <span className="text-dim">calls</span>
          <span className="text-amber font-semibold">{ev.name}</span>
        </div>
        <div className="mt-1 pl-3 text-muted border-l border-border/60">
          {ev.args.map((a, i) => (
            <div key={i}>{colorize(a)}</div>
          ))}
        </div>
      </div>
    );
  }

  if (ev.kind === "resp") {
    return (
      <div className="animate-fade-soft">
        <div className="text-dim italic text-[11px] uppercase tracking-widest">
          response
        </div>
        <div className="mt-1 pl-3 text-foreground/85 border-l border-border/60">
          {ev.lines.map((l, i) => (
            <div key={i}>{colorize(l)}</div>
          ))}
        </div>
      </div>
    );
  }

  if (ev.kind === "pay") {
    return (
      <div className="animate-fade-soft">
        <div className="flex items-baseline gap-2">
          <span className="text-amber-hi font-bold uppercase tracking-widest text-[11px]">
            x402 pay
          </span>
          <span className="text-dim italic text-[11px]">HTTP 402 · EIP-3009 · eip155:43113</span>
        </div>
        <div className="mt-1 pl-3 text-foreground/85 border-l border-amber-hi/40">
          {ev.lines.map((l, i) => (
            <div key={i}>{colorize(l)}</div>
          ))}
        </div>
      </div>
    );
  }

  if (ev.kind === "think") {
    return (
      <div className="animate-fade-soft flex items-center gap-2 text-dim italic">
        <span className="w-1.5 h-1.5 rounded-full bg-amber dot-pulse shrink-0" />
        <span className="text-muted not-italic">{ev.who}</span>
        <span className="text-dim">{ev.note}</span>
      </div>
    );
  }

  // done
  return (
    <div className="animate-fade-soft flex items-baseline gap-2">
      <span className="text-phosphor font-bold uppercase tracking-widest text-[11px]">
        done
      </span>
      <span className="text-muted">{colorize(ev.note)}</span>
    </div>
  );
}
