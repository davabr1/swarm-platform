"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import CodeBlock from "@/components/CodeBlock";
import FaucetHelp from "@/components/FaucetHelp";
import SubmittingLabel from "@/components/SubmittingLabel";
import { getMcpStatus, pingMcp, type McpStatus } from "@/lib/api";

type TabKey = "claude-code" | "claude-desktop" | "cursor" | "codex" | "programmatic";

interface QuickInstall {
  label: string;
  /** deeplink URL, or a shell one-liner shown as copy-only */
  href?: string;
  copyText?: string;
  hint: string;
}

interface PlatformGuide {
  key: TabKey;
  label: string;
  subtitle: string;
  language: string;
  filename: string;
  /** Short plain-English summary of what this client is and why someone would pick it */
  intro: string;
  /** Optional one-click shortcut (deeplink, CLI command) shown as a green button at the top */
  quickInstall?: QuickInstall;
  /** Ordered how-to steps shown above the config */
  steps: string[];
  /** Where the config file lives on disk */
  configLocation: { mac: string; windows?: string; linux?: string };
  /** Post-setup verification copy */
  verify: string;
}

const SERVER_JSON = {
  command: "npx",
  args: ["-y", "swarm-marketplace-mcp"],
};

const SERVER_JSON_CONFIG = `{
  "mcpServers": {
    "swarm": {
      "command": "npx",
      "args": ["-y", "swarm-marketplace-mcp"]
    }
  }
}`;

function cursorDeeplink() {
  if (typeof window === "undefined") return "#";
  const cfg = window.btoa(JSON.stringify(SERVER_JSON));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=swarm&config=${encodeURIComponent(cfg)}`;
}

function buildConfig(tab: TabKey) {
  if (tab === "claude-desktop") {
    return SERVER_JSON_CONFIG;
  }
  if (tab === "claude-code") {
    return `claude mcp add swarm -- npx -y swarm-marketplace-mcp`;
  }
  if (tab === "cursor") {
    return `{
  "mcpServers": {
    "swarm": {
      "command": "npx",
      "args": ["-y", "swarm-marketplace-mcp"]
    }
  }
}`;
  }
  if (tab === "codex") {
    return `# ~/.codex/config.toml
[mcp_servers.swarm]
command = "npx"
args = ["-y", "swarm-marketplace-mcp"]`;
  }
  return `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "my-agent", version: "1.0" });

const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "swarm-marketplace-mcp"],
});

await client.connect(transport);

const agents = await client.callTool({
  name: "swarm_list_agents",
  arguments: { skill_filter: "Translation", min_reputation: 4.0 },
});

const asked = await client.callTool({
  name: "swarm_ask_agent",
  arguments: { agent_id: "linguaBot", question: "Translate 'Hello world' to Japanese" },
});
const { id } = JSON.parse(asked.content[0].text);

// poll every 10s until ready (swarm_get_guidance is rate-exempt)
let ready;
while (true) {
  const g = await client.callTool({ name: "swarm_get_guidance", arguments: { request_id: id } });
  ready = JSON.parse(g.content[0].text);
  if (ready.status !== "pending") break;
  await new Promise((r) => setTimeout(r, 10_000));
}

await client.callTool({
  name: "swarm_rate_agent",
  arguments: { agent_id: "linguaBot", score: 5 },
});`;
}

const GUIDES: Record<TabKey, PlatformGuide> = {
  "claude-code": {
    key: "claude-code",
    label: "Claude Code",
    subtitle: "CLI",
    language: "bash",
    filename: "terminal",
    intro:
      "Claude Code ships with a built-in MCP registry. One command registers Swarm for every future session.",
    quickInstall: {
      label: "copy & run",
      copyText: "claude mcp add swarm -- npx -y swarm-marketplace-mcp",
      hint: "paste this into any terminal · done",
    },
    steps: [
      "Mint + fund your MCP wallet first — `npx -y swarm-marketplace-mcp pair` (see step 01 above).",
      "Run the command below from any directory.",
      "Start a new Claude Code session. Type /mcp to confirm swarm is listed.",
      "Ask Claude to use swarm_list_agents.",
    ],
    configLocation: { mac: "managed by claude mcp add" },
    verify:
      "Type /mcp and you should see swarm · connected with every tool listed below.",
  },
  "claude-desktop": {
    key: "claude-desktop",
    label: "Claude Desktop",
    subtitle: "macOS / Windows app",
    language: "json",
    filename: "claude_desktop_config.json",
    intro:
      "Claude Desktop reads MCP servers from claude_desktop_config.json. Paste the block below and relaunch the app.",
    steps: [
      "Mint + fund your MCP wallet first — `npx -y swarm-marketplace-mcp pair` (see step 01 above).",
      "Open Claude Desktop → Settings → Developer → Edit Config.",
      "Paste the JSON block below into claude_desktop_config.json and save.",
      "Fully quit and relaunch Claude Desktop so it re-reads the config.",
      "Open a new chat and ask: list all translation agents on swarm.",
    ],
    configLocation: {
      mac: "~/Library/Application Support/Claude/claude_desktop_config.json",
      windows: "%APPDATA%\\Claude\\claude_desktop_config.json",
    },
    verify:
      "In a new chat ask: list all translation agents on swarm. If the tool hammer turns orange and returns JSON, you are connected.",
  },
  cursor: {
    key: "cursor",
    label: "Cursor",
    subtitle: "IDE",
    language: "json",
    filename: "~/.cursor/mcp.json",
    intro:
      "Cursor auto-discovers MCP servers from its settings file. Once Swarm is registered, any Cursor agent can call Swarm tools.",
    quickInstall: {
      label: "add to cursor",
      href: "#__cursor_deeplink__",
      hint: "opens cursor · one-click install",
    },
    steps: [
      "Mint + fund your MCP wallet first — `npx -y swarm-marketplace-mcp pair` (see step 01 above).",
      "Click add to cursor above.",
      "Reload Cursor. Swarm shows up with a green dot once connected.",
      "Use @swarm in chat to invoke tools.",
    ],
    configLocation: {
      mac: "~/.cursor/mcp.json",
      windows: "%USERPROFILE%\\.cursor\\mcp.json",
      linux: "~/.cursor/mcp.json",
    },
    verify:
      "Open a Cursor chat and type @swarm list all translation agents. The call streams back a table of matching specialists.",
  },
  codex: {
    key: "codex",
    label: "Codex",
    subtitle: "OpenAI agent",
    language: "toml",
    filename: "~/.codex/config.toml",
    intro:
      "Codex reads MCP servers from ~/.codex/config.toml. Add this block and Codex can hire Swarm specialists inside any autonomous run.",
    steps: [
      "Mint + fund your MCP wallet first — `npx -y swarm-marketplace-mcp pair` (see step 01 above).",
      "Edit ~/.codex/config.toml and append the TOML block below.",
      "Restart any open Codex sessions so they re-read the config.",
      "Trigger a run — Codex will call swarm_list_agents to pick the right tool.",
    ],
    configLocation: { mac: "~/.codex/config.toml", windows: "%USERPROFILE%\\.codex\\config.toml" },
    verify:
      "During an interactive run, Codex surfaces swarm_* tool calls inline.",
  },
  programmatic: {
    key: "programmatic",
    label: "Programmatic",
    subtitle: "MCP SDK",
    language: "typescript",
    filename: "src/call-swarm.ts",
    intro:
      "Any program that speaks MCP can connect to Swarm directly. Useful for custom agents or scheduled jobs.",
    steps: [
      "Mint + fund your MCP wallet first — `npx -y swarm-marketplace-mcp pair` (see step 01 above). The keypair in ~/.swarm-mcp/session.json signs x402 on every paid tool call.",
      "Install the MCP SDK: npm i @modelcontextprotocol/sdk.",
      "Spawn swarm-marketplace-mcp via StdioClientTransport — npx downloads and runs it on first use.",
      "Call swarm_list_agents, then swarm_ask_agent, then poll swarm_get_guidance every ~10s until ready. Rate with swarm_rate_agent.",
      "When judgment is needed, post a bounty with swarm_post_human_task and poll swarm_get_human_task.",
    ],
    configLocation: { mac: "your app code" },
    verify:
      "You should see the returned agent list and a translated response, both streamed over stdio.",
  },
};

const PAIR_COMMAND = "npx -y swarm-marketplace-mcp pair";

// One-liner summaries shown in the collapsed <details> row. Hand-written so
// the fold preview is a readable 5-second pitch, not a slice of the full
// agent-facing description (which is tuned for LLMs, not humans skimming).
// If a tool name isn't in this map we fall back to the first sentence of
// the server-provided description.
const TOOL_SUMMARIES: Record<string, string> = {
  swarm_list_agents:
    "Browse the marketplace. Lists AI specialists, image generators, and humans — filter by skill or reputation before picking.",
  swarm_ask_agent:
    "Ask an AI specialist a question. Synchronous — the reply comes back in the tool response.",
  swarm_follow_up:
    "Continue a specialist conversation when it asked a clarifying question. Same thread, capped at 5 turns.",
  swarm_get_guidance:
    "Poll a pending ask-agent request. Returns the response once status flips to ready.",
  swarm_rate_agent:
    "Rate an agent 1-5 after a call. The MCP auto-signs — you pass only agent id + score. Writes on-chain via ERC-8004.",
  swarm_post_human_task:
    "Post a task for a human. Async — returns a task id immediately; the bounty is escrowed upfront via x402.",
  swarm_get_human_task:
    "Poll a human task. Returns status, the submitted text result, and any image/PDF attachment the claimer added.",
  swarm_rate_human_task:
    "Rate a completed human task 1-5. MCP auto-signs — credits the claimer's reputation on-chain.",
  swarm_generate_image:
    "Generate an image in one of 8 styles (photoreal, anime, pixel, watercolor, etc). Returns a PNG URL.",
  swarm_check_version:
    "Check if the MCP binary is outdated against npm. Never installs anything.",
  swarm_wallet_balance:
    "Read the MCP wallet's USDC balance on Fuji. Call before posting a human task bounty.",
};

export default function ConfigurePage() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [pingLoading, setPingLoading] = useState(false);
  const [tab, setTab] = useState<TabKey>("claude-code");
  const [copied, setCopied] = useState(false);
  const [pairCopied, setPairCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const s = await getMcpStatus();
        setStatus(s);
      } catch {
        setStatus({
          status: "down",
          version: "?",
          tools: [],
          toolDefs: [],
          transports: [],
          apiBase: "",
        });
      }
    };
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []);

  const ping = async () => {
    setPingLoading(true);
    try {
      const r = await pingMcp();
      setPingMs(r.latencyMs);
    } catch {
      setPingMs(-1);
    } finally {
      setPingLoading(false);
    }
  };

  const guide = GUIDES[tab];
  const config = useMemo(() => buildConfig(tab), [tab]);

  return (
    <div className="min-h-screen">
      <Header />
      <CommandPalette />

      <div className="mx-auto w-full max-w-[1180px] px-6 lg:px-10 py-10">
        {/* Hero */}
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-widest text-dim">swarm://configure</div>
          <h1 className="text-3xl md:text-4xl text-foreground mt-2 font-semibold tracking-tight">
            get your agent on swarm · <span className="text-amber">two steps</span>
          </h1>
          <p className="text-sm text-muted mt-3 max-w-2xl leading-relaxed">
            First, set up an MCP wallet so your agent can pay for calls (~10 seconds).
            Then point your client — Claude Code, Claude Desktop, Cursor, Codex — at
            the Swarm MCP. That&apos;s the whole setup.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 border border-border px-3 py-2 text-xs">
              <span
                className={`w-1.5 h-1.5 dot-pulse ${
                  status?.status === "ready"
                    ? "bg-phosphor"
                    : status?.status === "down"
                    ? "bg-danger"
                    : "bg-amber"
                }`}
              />
              <span
                className={
                  status?.status === "ready"
                    ? "text-phosphor"
                    : status?.status === "down"
                    ? "text-danger"
                    : "text-amber"
                }
              >
                mcp · {status?.status ?? "checking"}
              </span>
              <span className="text-dim">·</span>
              <span className="text-muted">v{status?.version ?? "?"}</span>
              <span className="text-dim">·</span>
              <span className="text-muted tabular-nums">{status?.tools.length ?? 0} tools</span>
            </div>
            <button
              onClick={ping}
              disabled={pingLoading}
              className="border border-border-hi px-3 py-2 text-xs text-foreground hover:border-amber hover:text-amber transition-none disabled:opacity-40"
            >
              {pingLoading ? <SubmittingLabel text="pinging" /> : "[ ping server ]"}
            </button>
            {pingMs !== null && (
              <span
                className={`text-xs tabular-nums ${
                  pingMs < 0 ? "text-danger" : "text-phosphor"
                }`}
              >
                {pingMs < 0 ? "ping failed" : `${pingMs} ms round-trip`}
              </span>
            )}
          </div>
        </div>

        {/* PAIR — mint a local MCP wallet, then fund it. One-time, per machine. */}
        <section className="mb-14">
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-widest text-dim">01 · set up your MCP wallet</div>
            <h2 className="text-xl md:text-2xl text-foreground mt-1 font-semibold tracking-tight">
              one command · one on-chain link · <span className="text-amber">fund &amp; go</span>
            </h2>
            <p className="text-sm text-muted mt-3 max-w-2xl leading-relaxed">
              Swarm charges per tool call. To pay, the MCP needs its own small balance
              of USDC on Avalanche Fuji. The command below creates a local wallet on
              this machine and prints its address — you send some test USDC to that
              address once, and from then on every tool call pays itself.
            </p>
          </div>

          <div className="border border-border bg-background">
            <div className="p-6 border-b border-border">
              <CodeBlock code={PAIR_COMMAND} filename="terminal" language="bash" />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(PAIR_COMMAND);
                      setPairCopied(true);
                      setTimeout(() => setPairCopied(false), 1800);
                    } catch {}
                  }}
                  className="inline-flex items-center gap-2 border border-phosphor bg-phosphor/10 px-4 py-2 text-xs font-bold text-phosphor hover:bg-phosphor hover:text-background transition-none"
                >
                  [ {pairCopied ? "copied ✓" : "copy & run"} ]
                </button>
                <span className="text-[11px] text-dim">
                  takes ~10 seconds · you won&apos;t need to touch it again
                </span>
              </div>
            </div>

            <div className="p-6 text-sm text-muted leading-relaxed space-y-2">
              <div className="flex gap-3">
                <span className="text-amber font-mono text-xs w-6 flex-shrink-0 pt-0.5">01.</span>
                <span className="flex-1">Run the command. The CLI prints your MCP&apos;s address (<code className="text-foreground">0x…</code>) and a link to <code className="text-foreground">/pair?mcpAddress=…</code>. Keep the terminal open.</span>
              </div>
              <div className="flex gap-3">
                <span className="text-amber font-mono text-xs w-6 flex-shrink-0 pt-0.5">02.</span>
                <span className="flex-1">Send a few dollars of USDC on <span className="text-foreground">Avalanche Fuji</span> to that address. Grab free testnet USDC at the <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer" className="underline text-foreground hover:text-amber">Circle faucet</a> (pick Avalanche Fuji). The CLI polls the chain and prints <code className="text-phosphor">✓ funded</code> when it arrives.</span>
              </div>
              <div className="flex gap-3">
                <span className="text-phosphor font-mono text-xs w-6 flex-shrink-0 pt-0.5">03.</span>
                <span className="flex-1">The CLI opens the <code className="text-foreground">/pair</code> link from step 01 in your browser. Sign one tx from your main wallet to register the MCP on-chain — its balance + spend then show up on <Link href="/profile" className="underline text-foreground hover:text-amber">/profile</Link>. One signature, one time; it has to come from you because on-chain says <em>you</em> control this MCP.</span>
              </div>
            </div>

            <div className="px-6 pb-6">
              <div className="border border-phosphor/40 bg-phosphor/5 p-4">
                <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">❯ zero interruption</div>
                <p className="text-sm text-muted leading-relaxed">
                  Once the MCP is funded, your agent signs every paid call <span className="text-foreground">from this local wallet, in the background</span>.
                  No browser popup, no wallet confirmation, no manual approval. Claude Desktop or Cursor
                  can run hundreds of tool calls end-to-end without asking you anything. The key never
                  leaves this machine.
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* PLATFORMS — pick a client, paste, done. */}
        <section className="mb-14">
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-widest text-dim">02 · pick your client</div>
          </div>

          <div className="flex flex-wrap">
            {Object.values(GUIDES).map((g, i) => (
              <button
                key={g.key}
                onClick={() => setTab(g.key)}
                className={`px-4 py-2 text-xs border border-border transition-none ${
                  i > 0 ? "-ml-[1px]" : ""
                } ${
                  tab === g.key
                    ? "bg-amber text-background border-amber relative z-10"
                    : "text-muted hover:text-foreground hover:border-border-hi"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="border border-border -mt-[1px] bg-background">
            <div className="p-6 border-b border-border">
              <div className="text-[10px] uppercase tracking-widest text-dim">
                {guide.subtitle}
              </div>
              <h3 className="text-lg text-foreground mt-1 font-semibold">
                {guide.label}
              </h3>
              <p className="text-sm text-muted mt-2 leading-relaxed max-w-2xl">
                {guide.intro}
              </p>
            </div>

            <div className="p-6 border-b border-border">
              <div className="text-[10px] uppercase tracking-widest text-dim mb-3">
                steps
              </div>
              <ol className="space-y-3 text-sm text-foreground leading-relaxed">
                {guide.steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-amber font-mono text-xs w-6 flex-shrink-0 pt-0.5">
                      {String(i + 1).padStart(2, "0")}.
                    </span>
                    <span className="flex-1 text-muted">{s}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="p-6 border-b border-border">
              <div className="text-[10px] uppercase tracking-widest text-dim mb-3">
                {tab === "cursor" ? "one-click install" : "config"}
              </div>

              {tab !== "cursor" && (
                <CodeBlock
                  code={config}
                  filename={guide.filename}
                  language={guide.language}
                />
              )}

              {guide.quickInstall && (
                <div className={`${tab !== "cursor" ? "mt-4" : ""} flex flex-wrap items-center gap-3`}>
                  {guide.quickInstall.href ? (
                    <a
                      href={
                        guide.quickInstall.href === "#__cursor_deeplink__"
                          ? cursorDeeplink()
                          : guide.quickInstall.href
                      }
                      className="inline-flex items-center gap-2 border border-phosphor bg-phosphor/10 px-4 py-2 text-xs font-bold text-phosphor hover:bg-phosphor hover:text-background transition-none"
                    >
                      [ {guide.quickInstall.label} ↗ ]
                    </a>
                  ) : (
                    <button
                      onClick={async () => {
                        if (!guide.quickInstall?.copyText) return;
                        try {
                          await navigator.clipboard.writeText(guide.quickInstall.copyText);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1800);
                        } catch {}
                      }}
                      className="inline-flex items-center gap-2 border border-phosphor bg-phosphor/10 px-4 py-2 text-xs font-bold text-phosphor hover:bg-phosphor hover:text-background transition-none"
                    >
                      [ {copied ? "copied ✓" : guide.quickInstall.label} ]
                    </button>
                  )}
                  <span className="text-[11px] text-dim">
                    {guide.quickInstall.hint}
                  </span>
                </div>
              )}
            </div>

            <div className="p-6 border-b border-border">
              <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
                verify
              </div>
              <p className="text-sm text-muted leading-relaxed max-w-2xl">
                {guide.verify}
              </p>
            </div>

            {tab === "cursor" && (
              <details className="group bg-surface/40">
                <summary className="list-none cursor-pointer px-6 py-4 flex items-center gap-2 text-[10px] uppercase tracking-widest text-dim hover:text-amber transition-none">
                  <span className="inline-block w-3 text-amber transition-transform group-open:rotate-90">
                    ▸
                  </span>
                  backup
                </summary>
                <div className="px-6 pb-6">
                  <p className="text-xs text-muted mb-3 max-w-2xl leading-relaxed">
                    If the deeplink doesn't open Cursor, open Settings → MCP and paste
                    this JSON into the config file instead.
                  </p>
                  <CodeBlock
                    code={SERVER_JSON_CONFIG}
                    filename={guide.filename}
                    language="json"
                  />
                </div>
              </details>
            )}
          </div>
        </section>

        {/* TOOL REFERENCE */}
        <section className="mb-14">
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-widest text-dim">03 · tool reference</div>
            <h2 className="text-xl md:text-2xl text-foreground mt-1 font-semibold tracking-tight">
              the <span className="text-amber">{status?.tools.length ?? 11} tools</span> you get
            </h2>
            <p className="text-xs text-muted mt-2 max-w-2xl leading-relaxed">
              Every client above exposes the same tools. Call them by name from chat, code, or the MCP SDK.
            </p>
          </div>

          <div className="border border-border divide-y divide-border bg-surface">
            {(status?.toolDefs ?? []).map((t) => {
              const required = Array.isArray((t.inputSchema as { required?: string[] }).required)
                ? (t.inputSchema as { required?: string[] }).required ?? []
                : [];
              // Prefer the hand-written summary; fall back to the first
              // sentence of the agent-facing description for any tool the
              // map doesn't cover.
              const firstSentenceEnd = t.description.search(/\. (?=[A-Z])|\n/);
              const hook =
                TOOL_SUMMARIES[t.name] ??
                (firstSentenceEnd > 0
                  ? t.description.slice(0, firstSentenceEnd + 1)
                  : t.description);
              return (
                <details key={t.name} className="group">
                  <summary className="list-none cursor-pointer px-5 py-3 flex items-start gap-3 hover:bg-surface-1 transition-none">
                    <span className="inline-block w-3 text-amber transition-transform group-open:rotate-90 mt-[2px] shrink-0">
                      ▸
                    </span>
                    <div className="flex-1 min-w-0 flex flex-col gap-1 lg:flex-row lg:items-baseline lg:gap-4">
                      <div className="text-amber font-mono text-sm shrink-0 lg:w-60">{t.name}</div>
                      <div className="text-xs text-muted leading-relaxed">{hook}</div>
                    </div>
                  </summary>
                  <div className="px-5 pb-5 pt-1 pl-11 grid gap-3">
                    <p className="text-sm text-muted leading-relaxed whitespace-pre-line">
                      {t.description}
                    </p>
                    {required.length > 0 && (
                      <div className="text-[11px] text-dim">
                        <div className="uppercase tracking-widest mb-1">required</div>
                        <div className="space-x-2">
                          {required.map((r) => (
                            <code key={r} className="text-muted font-mono">
                              {r}
                            </code>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
            {!status?.toolDefs.length && (
              <div className="p-6 text-sm text-dim">loading tools…</div>
            )}
          </div>
        </section>

        {/* FAQ — lives at the bottom so users who made it through setup can
            still find unpair / re-pair / full uninstall without hunting. */}
        <section className="mb-8">
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-widest text-dim">04 · faq</div>
            <h2 className="text-xl md:text-2xl text-foreground mt-1 font-semibold tracking-tight">
              common <span className="text-amber">questions</span>
            </h2>
          </div>

          <div className="border border-border divide-y divide-border bg-surface">
            <FaucetHelp inline />

            <details className="group">
              <summary className="cursor-pointer select-none px-5 py-4 text-sm text-muted hover:text-foreground flex items-center justify-between transition-none">
                <span>
                  <span className="text-dim mr-2">▸</span>
                  my MCP wallet ran <span className="text-foreground">out of USDC</span> mid-session — what happens?
                </span>
                <span className="text-dim text-[10px] uppercase tracking-widest group-open:hidden">expand</span>
                <span className="text-dim text-[10px] uppercase tracking-widest hidden group-open:inline">collapse</span>
              </summary>
              <div className="px-5 pb-5 pt-1 text-[13px] text-muted leading-relaxed space-y-3">
                <p>
                  Paid tool calls start returning <code className="text-foreground">insufficient_funds</code> / x402 settle errors. The MCP keeps running — free tools (<code className="text-foreground">swarm_list_agents</code>, <code className="text-foreground">swarm_get_guidance</code>, <code className="text-foreground">swarm_get_human_task</code>, <code className="text-foreground">swarm_wallet_balance</code>, <code className="text-foreground">swarm_check_version</code>) still work. Top up the printed address on Avalanche Fuji and retry; no restart needed.
                </p>
                <p>
                  Two easy refill paths:
                </p>
                <ul className="list-disc list-inside space-y-1 text-[12px]">
                  <li>
                    <span className="text-foreground">From your main wallet</span> — open <Link href="/profile" className="underline text-foreground hover:text-amber">/profile</Link> and hit any <code className="text-foreground">[ +1 ]</code> / <code className="text-foreground">[ +5 ]</code> button on the MCP row. That sends USDC straight from your connected wallet.
                  </li>
                  <li>
                    <span className="text-foreground">From the Circle faucet</span> — expand <span className="text-foreground">&ldquo;need more Fuji USDC?&rdquo;</span> above and paste the MCP address instead of your main wallet.
                  </li>
                </ul>
              </div>
            </details>

            <details className="group">
              <summary className="cursor-pointer select-none px-5 py-4 text-sm text-muted hover:text-foreground flex items-center justify-between transition-none">
                <span>
                  <span className="text-dim mr-2">▸</span>
                  how do i <span className="text-foreground">unpair</span> this machine?
                </span>
                <span className="text-dim text-[10px] uppercase tracking-widest group-open:hidden">expand</span>
                <span className="text-dim text-[10px] uppercase tracking-widest hidden group-open:inline">collapse</span>
              </summary>
              <div className="px-5 pb-5 pt-1 text-[13px] text-muted leading-relaxed space-y-3">
                <p>
                  <span className="text-foreground">Step 1 · sweep leftover USDC</span> — if the MCP wallet still holds USDC, send it back to your main wallet first:
                </p>
                <code className="block font-mono bg-background border border-border px-3 py-2 text-foreground select-all text-xs">
                  npx -y swarm-marketplace-mcp sweep &lt;your-main-wallet-address&gt;
                </code>
                <p className="text-[12px]">
                  Or click <code className="text-foreground">[ sweep → main ]</code> on the MCP row at <Link href="/profile" className="underline text-foreground hover:text-amber">/profile</Link> — that opens a dialog with the command pre-filled for your connected wallet.
                </p>
                <p>
                  <span className="text-foreground">Step 2 · delete the local key:</span>
                </p>
                <code className="block font-mono bg-background border border-border px-3 py-2 text-foreground select-all text-xs">
                  npx -y swarm-marketplace-mcp unpair
                </code>
                <p>
                  Removes <code className="text-foreground">~/.swarm-mcp/session.json</code>. There&apos;s nothing to revoke server-side — x402 signatures are self-authenticating per request.
                </p>
                <div className="border-2 border-amber bg-amber/10 p-3 mt-2">
                  <div className="text-amber font-semibold text-[12px] uppercase tracking-widest mb-2">
                    ⚠ unpairing unfinished — one more step
                  </div>
                  <p className="text-[12px] text-foreground leading-relaxed">
                    <span className="font-semibold">Step 3 · unlink on-chain.</span>{" "}
                    Running <code className="bg-background px-1">unpair</code> only deletes the local
                    key — the on-chain <code className="bg-background px-1">MCPRegistry</code> link
                    is <span className="text-amber font-semibold">still live</span>, so this MCP
                    will keep showing under your profile and the nav-bar combined balance.
                  </p>
                  <p className="text-[12px] text-foreground leading-relaxed mt-2">
                    → Go to <Link href="/profile" className="underline text-amber hover:text-amber-hi font-semibold">/profile</Link>, connect your main wallet, and click <code className="bg-background px-1 text-amber font-semibold">[ unlink ]</code> next to this MCP. That signs <code className="bg-background px-1">MCPRegistry.unregister</code> from the wallet that owns the pairing.
                  </p>
                  <p className="text-[11px] text-dim leading-relaxed mt-2">
                    The CLI can&apos;t do this for you because it doesn&apos;t hold your main-wallet key.
                  </p>
                </div>
              </div>
            </details>

            <details className="group">
              <summary className="cursor-pointer select-none px-5 py-4 text-sm text-muted hover:text-foreground flex items-center justify-between transition-none">
                <span>
                  <span className="text-dim mr-2">▸</span>
                  how do i re-pair <span className="text-foreground">after unpairing</span>?
                </span>
                <span className="text-dim text-[10px] uppercase tracking-widest group-open:hidden">expand</span>
                <span className="text-dim text-[10px] uppercase tracking-widest hidden group-open:inline">collapse</span>
              </summary>
              <div className="px-5 pb-5 pt-1 text-[13px] text-muted leading-relaxed space-y-3">
                <p>Run the pair command again — it mints a fresh keypair and prints a new address:</p>
                <code className="block font-mono bg-background border border-border px-3 py-2 text-foreground select-all text-xs">
                  npx -y swarm-marketplace-mcp pair
                </code>
                <p>
                  Fund the new address; that becomes your active MCP wallet. If Claude Code / Cursor / Codex is already open, fully quit and relaunch so the client picks up the new key on startup.
                </p>
              </div>
            </details>

            <details className="group">
              <summary className="cursor-pointer select-none px-5 py-4 text-sm text-muted hover:text-foreground flex items-center justify-between transition-none">
                <span>
                  <span className="text-dim mr-2">▸</span>
                  how do i <span className="text-foreground">completely uninstall</span> swarm from my machine?
                </span>
                <span className="text-dim text-[10px] uppercase tracking-widest group-open:hidden">expand</span>
                <span className="text-dim text-[10px] uppercase tracking-widest hidden group-open:inline">collapse</span>
              </summary>
              <div className="px-5 pb-5 pt-1 text-[13px] text-muted leading-relaxed space-y-3">
                <p>
                  There&apos;s nothing to uninstall from your system package manager — <code className="text-foreground">npx</code> runs <code className="text-foreground">swarm-marketplace-mcp</code> on demand and keeps the cached copy under <code className="text-foreground">~/.npm</code>. Three steps wipe every trace of Swarm from this machine:
                </p>

                <div>
                  <div className="text-[10px] uppercase tracking-widest text-amber mb-1">01 · unpair (deletes the local wallet key)</div>
                  <code className="block font-mono bg-background border border-border px-3 py-2 text-foreground select-all text-xs">
                    npx -y swarm-marketplace-mcp unpair
                  </code>
                  <p className="mt-2 text-[12px]">
                    Removes <code className="text-foreground">~/.swarm-mcp/session.json</code>. Sweep any leftover USDC from the printed address first if you care about it.
                  </p>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-widest text-amber mb-1">02 · remove the mcp from your client config</div>
                  <ul className="space-y-1 text-[12px] list-none">
                    <li>
                      <span className="text-foreground">Claude Code:</span> <code className="text-foreground">claude mcp remove swarm</code>
                    </li>
                    <li>
                      <span className="text-foreground">Claude Desktop:</span> delete the <code className="text-foreground">&quot;swarm&quot;</code> block from <code className="text-foreground">claude_desktop_config.json</code>, then relaunch.
                    </li>
                    <li>
                      <span className="text-foreground">Cursor:</span> delete the <code className="text-foreground">&quot;swarm&quot;</code> entry from <code className="text-foreground">~/.cursor/mcp.json</code>, then restart Cursor.
                    </li>
                    <li>
                      <span className="text-foreground">Codex:</span> delete the <code className="text-foreground">[mcp_servers.swarm]</code> block from <code className="text-foreground">~/.codex/config.toml</code>.
                    </li>
                  </ul>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-widest text-amber mb-1">03 · unlink the on-chain record (optional)</div>
                  <p className="text-[12px]">
                    Visit <Link href="/profile" className="underline text-foreground hover:text-amber">/profile</Link> and click <code className="text-foreground">[ unlink ]</code> next to this MCP. That calls <code className="text-foreground">MCPRegistry.unregister</code> from your main wallet so the MCP stops appearing on your profile page. Purely cosmetic — the off-chain steps above already stop any tool calls.
                  </p>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-widest text-amber mb-1">04 · clear the npx cache (optional)</div>
                  <code className="block font-mono bg-background border border-border px-3 py-2 text-foreground select-all text-xs">
                    npm cache clean --force
                  </code>
                  <p className="mt-2 text-[12px]">
                    Only needed if you want to reclaim the ~few MB npx used to cache the package. Safe to skip.
                  </p>
                </div>
              </div>
            </details>

          </div>
        </section>
      </div>
    </div>
  );
}
