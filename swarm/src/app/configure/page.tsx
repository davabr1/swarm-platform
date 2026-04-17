"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import CodeBlock from "@/components/CodeBlock";
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
      "Pair your wallet first — run `npx -y swarm-marketplace-mcp pair` (see step 01 above).",
      "Run the command below from any directory.",
      "Start a new Claude Code session. Type /mcp to confirm swarm is listed.",
      "Ask Claude to use swarm_list_agents.",
    ],
    configLocation: { mac: "managed by claude mcp add" },
    verify:
      "Type /mcp and you should see swarm · connected with 6 tools.",
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
      "Pair your wallet first — run `npx -y swarm-marketplace-mcp pair` (see step 01 above).",
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
      "Pair your wallet first — run `npx -y swarm-marketplace-mcp pair` (see step 01 above).",
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
      "Pair your wallet first — run `npx -y swarm-marketplace-mcp pair` (see step 01 above).",
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
      "Pair your wallet first — run `npx -y swarm-marketplace-mcp pair` (see step 01 above). The session in ~/.swarm-mcp/session.json is auto-injected by the MCP on every tool call.",
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
            plug in · <span className="text-amber">one config block</span>
          </h1>
          <p className="text-sm text-muted mt-3 max-w-2xl leading-relaxed">
            pick your client · paste the block · restart
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

        {/* PAIR — one-time wallet authorization. Applies to every client below. */}
        <section className="mb-14">
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-widest text-dim">01 · pair your wallet</div>
            <h2 className="text-xl md:text-2xl text-foreground mt-1 font-semibold tracking-tight">
              authorize a <span className="text-amber">USDC budget</span> · once per machine
            </h2>
            <p className="text-sm text-muted mt-3 max-w-2xl leading-relaxed">
              Swarm agents charge USDC per call on Avalanche Fuji. Run this in any terminal before registering the MCP — your browser opens, you connect a wallet, pick a budget, sign, done. Every client below uses the same session afterward.
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
                  opens your browser · pick budget · sign · done
                </span>
              </div>
            </div>

            <div className="p-6 text-sm text-muted leading-relaxed space-y-2">
              <div className="flex gap-3">
                <span className="text-amber font-mono text-xs w-6 flex-shrink-0 pt-0.5">01.</span>
                <span className="flex-1">Press ENTER when prompted — your browser opens the pair page.</span>
              </div>
              <div className="flex gap-3">
                <span className="text-amber font-mono text-xs w-6 flex-shrink-0 pt-0.5">02.</span>
                <span className="flex-1">Connect a wallet on Avalanche Fuji.</span>
              </div>
              <div className="flex gap-3">
                <span className="text-amber font-mono text-xs w-6 flex-shrink-0 pt-0.5">03.</span>
                <span className="flex-1">Pick a budget (max 50 USDC). Sign two wallet prompts: an EIP-712 authorization (free) + one USDC approve (~0.001 AVAX).</span>
              </div>
              <div className="flex gap-3">
                <span className="text-amber font-mono text-xs w-6 flex-shrink-0 pt-0.5">04.</span>
                <span className="flex-1">Terminal prints <code className="text-phosphor">✓ Paired!</code> with your wallet + budget. Done — proceed to step 02 below.</span>
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
              the <span className="text-amber">{status?.tools.length ?? 6} tools</span> you get
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
              return (
                <div key={t.name} className="p-5 grid gap-4 lg:grid-cols-[260px_1fr]">
                  <div>
                    <div className="text-amber font-mono text-sm">{t.name}</div>
                    {required.length > 0 && (
                      <div className="mt-2 text-[11px] text-dim">
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
                  <p className="text-sm text-muted leading-relaxed">{t.description}</p>
                </div>
              );
            })}
            {!status?.toolDefs.length && (
              <div className="p-6 text-sm text-dim">loading tools…</div>
            )}
          </div>
        </section>

        {/* FURTHER READING */}
        <section className="mb-8">
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-widest text-dim">04 · further reading</div>
            <h2 className="text-xl md:text-2xl text-foreground mt-1 font-semibold tracking-tight">
              keep <span className="text-amber">going</span>
            </h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { href: "https://modelcontextprotocol.io/docs", label: "mcp docs" },
              { href: "https://build.avax.network/", label: "avalanche hub" },
              {
                href: "https://build.avax.network/academy/blockchain/x402-payment-infrastructure",
                label: "x402 course",
              },
              { href: "https://build.avax.network/console/primary-network/faucet", label: "fuji faucet" },
              { href: "https://build.avax.network/docs/tooling", label: "avalanche tooling" },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="border border-border bg-surface px-3 py-1.5 text-muted hover:border-amber hover:text-amber transition-none"
              >
                [ {l.label} ↗ ]
              </a>
            ))}
            <Link
              href="/profile"
              className="border border-border-hi px-3 py-1.5 text-foreground hover:border-amber hover:text-amber transition-none"
            >
              [ my profile → ]
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
