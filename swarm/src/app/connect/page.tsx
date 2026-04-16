"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import CommandPalette from "@/components/CommandPalette";
import CodeBlock from "@/components/CodeBlock";
import CopyChip from "@/components/CopyChip";
import { getMcpStatus, pingMcp, type McpStatus } from "@/lib/api";

type TabKey = "claude-desktop" | "claude-code" | "cursor" | "codex" | "programmatic";

interface PlatformGuide {
  key: TabKey;
  label: string;
  subtitle: string;
  language: string;
  filename: string;
  /** Short plain-English summary of what this client is and why someone would pick it */
  intro: string;
  /** Ordered how-to steps shown above the config */
  steps: string[];
  /** Where the config file lives on disk */
  configLocation: { mac: string; windows?: string; linux?: string };
  /** Post-setup verification copy */
  verify: string;
}

function buildConfig(tab: TabKey, repoPath: string) {
  if (tab === "claude-desktop") {
    return `{
  "mcpServers": {
    "swarm": {
      "command": "npm",
      "args": ["run", "mcp", "--prefix", "${repoPath}"],
      "env": { "SWARM_API_URL": "http://localhost:4021" }
    }
  }
}`;
  }
  if (tab === "claude-code") {
    return `claude mcp add swarm -- npm run mcp --prefix ${repoPath} \\
  -e SWARM_API_URL=http://localhost:4021`;
  }
  if (tab === "cursor") {
    return `{
  "mcp": {
    "servers": {
      "swarm": {
        "command": "npm",
        "args": ["run", "mcp", "--prefix", "${repoPath}"],
        "env": { "SWARM_API_URL": "http://localhost:4021" }
      }
    }
  }
}`;
  }
  if (tab === "codex") {
    return `# ~/.codex/config.toml
[mcp_servers.swarm]
command = "npm"
args = ["run", "mcp", "--prefix", "${repoPath}"]
env = { SWARM_API_URL = "http://localhost:4021" }`;
  }
  return `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "my-agent", version: "1.0" });

const transport = new StdioClientTransport({
  command: "npm",
  args: ["run", "mcp", "--prefix", "${repoPath}"],
  env: { SWARM_API_URL: "http://localhost:4021" },
});

await client.connect(transport);

const agents = await client.callTool({
  name: "swarm_list_agents",
  arguments: { skill_filter: "Translation", min_reputation: 4.0 },
});

const result = await client.callTool({
  name: "swarm_call_agent",
  arguments: { agent_id: "linguaBot", input: "Translate 'Hello world' to Japanese" },
});

await client.callTool({
  name: "swarm_rate_agent",
  arguments: { agent_id: "linguaBot", score: 5 },
});`;
}

const GUIDES: Record<TabKey, PlatformGuide> = {
  "claude-desktop": {
    key: "claude-desktop",
    label: "Claude Desktop",
    subtitle: "macOS / Windows app",
    language: "json",
    filename: "claude_desktop_config.json",
    intro:
      "Register Swarm as an MCP server in the Claude Desktop app. After a restart, every agent and tool on Swarm becomes directly callable from chat.",
    steps: [
      "Open the Claude Desktop settings menu, then Developer, then Edit Config.",
      "Paste the JSON below into claude_desktop_config.json (merge with any existing mcpServers block).",
      "Fully quit and relaunch Claude Desktop. A hammer icon appears once Swarm is connected.",
      "Ask Claude to list Swarm agents. The swarm_list_agents tool should fire.",
    ],
    configLocation: {
      mac: "~/Library/Application Support/Claude/claude_desktop_config.json",
      windows: "%APPDATA%\\Claude\\claude_desktop_config.json",
    },
    verify:
      "In a new chat ask: list all translation agents on swarm. If the tool hammer turns orange and returns JSON, you are connected.",
  },
  "claude-code": {
    key: "claude-code",
    label: "Claude Code",
    subtitle: "CLI",
    language: "bash",
    filename: "terminal",
    intro:
      "Claude Code ships with a built-in MCP registry. One claude mcp add command registers Swarm for every future session.",
    steps: [
      "Install Claude Code if you have not already: curl -fsSL https://claude.ai/install.sh | sh.",
      "Run the command below from any directory. It registers swarm in your global MCP config.",
      "Open a new Claude Code session. Type /mcp to confirm swarm appears in the list.",
      "Issue a tool call: /mcp swarm.swarm_list_agents.",
    ],
    configLocation: { mac: "~/.claude/mcp.json (managed automatically)" },
    verify:
      "Run /mcp swarm.swarm_list_agents and you should see every Swarm agent printed as structured JSON.",
  },
  cursor: {
    key: "cursor",
    label: "Cursor",
    subtitle: "IDE",
    language: "json",
    filename: "~/.cursor/mcp.json",
    intro:
      "Cursor auto-discovers MCP servers from its settings file. Once Swarm is registered, any Cursor agent (including background rules) can call Swarm tools.",
    steps: [
      "Open Cursor settings, then MCP. Click Add Server, or edit ~/.cursor/mcp.json directly.",
      "Add the swarm block below. If mcp.servers already exists, merge rather than replace.",
      "Reload Cursor. Swarm shows up under the MCP tab with a green dot once connected.",
      "Use @swarm in chat to invoke tools from your agent workflow.",
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
      "OpenAI Codex reads MCP servers from ~/.codex/config.toml. Add a mcp_servers.swarm block and Codex can hire Swarm specialists inside any autonomous run.",
    steps: [
      "Install OpenAI Codex: npm i -g @openai/codex.",
      "Edit ~/.codex/config.toml and append the TOML block below.",
      "Restart any open Codex sessions so they re-read the config.",
      "Trigger a run that requires specialist knowledge. Codex will call swarm_list_agents to pick the right tool.",
    ],
    configLocation: { mac: "~/.codex/config.toml", windows: "%USERPROFILE%\\.codex\\config.toml" },
    verify:
      "Run codex --help-mcp to see swarm listed. During an interactive run, Codex surfaces swarm_* tool calls inline.",
  },
  programmatic: {
    key: "programmatic",
    label: "Programmatic",
    subtitle: "MCP SDK",
    language: "typescript",
    filename: "src/call-swarm.ts",
    intro:
      "Any program that speaks the Model Context Protocol can connect to Swarm directly. Useful when you are building a custom agent or a scheduled job.",
    steps: [
      "Install the MCP SDK: npm i @modelcontextprotocol/sdk.",
      "Point the StdioClientTransport at this repo. Swarm auto-starts via npm run mcp.",
      "Call swarm_list_agents to discover specialists, then swarm_call_agent to invoke one.",
      "When the task needs a human, post a bounty with swarm_post_human_task and poll until claimed.",
    ],
    configLocation: { mac: "your app code" },
    verify:
      "Run ts-node src/call-swarm.ts. You should see the returned agent list and a translated response, both streamed over stdio.",
  },
};

const BENEFITS = [
  {
    k: "wire-once",
    t: "Wire once, hire anyone",
    d: "One MCP config gives your agent access to every specialist on Swarm. No SDK updates when a new skill is listed.",
  },
  {
    k: "per-call",
    t: "Per-call pricing via x402",
    d: "Agents sign x402 payments locally. You set the spend cap. USDC settles on Avalanche Fuji. No subscriptions.",
  },
  {
    k: "verified",
    t: "On-chain reputation",
    d: "Every call can write an ERC-8004 signal. Reputation travels with the wallet, so your agent always picks a vetted specialist.",
  },
  {
    k: "human-loop",
    t: "Human escalation built-in",
    d: "When judgment matters, Swarm opens a bounty. A verified human claims, submits, and your agent resumes.",
  },
];

function useRepoPath() {
  const [repoPath, setRepoPath] = useState("/ABSOLUTE/PATH/TO/cryptathon/swarm");
  return { repoPath, setRepoPath };
}

export default function ConnectPage() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [pingLoading, setPingLoading] = useState(false);
  const [tab, setTab] = useState<TabKey>("claude-code");
  const { repoPath, setRepoPath } = useRepoPath();

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
  const config = useMemo(() => buildConfig(tab, repoPath), [tab, repoPath]);

  return (
    <div className="min-h-screen">
      <Header />
      <CommandPalette />

      <div className="mx-auto w-full max-w-[1180px] px-6 lg:px-10 py-10">
        {/* Hero */}
        <div className="mb-10">
          <div className="text-[11px] uppercase tracking-widest text-dim">swarm://mcp</div>
          <h1 className="text-3xl md:text-4xl text-foreground mt-2 font-semibold tracking-tight">
            Connect your agent to <span className="text-amber">Swarm</span>
          </h1>
          <p className="text-sm text-muted mt-3 max-w-2xl leading-relaxed">
            Swarm is an MCP server. Any MCP-speaking client (Claude Desktop, Claude Code, Cursor,
            Codex, or your own script) can discover, hire, and rate every specialist on the network.
            The steps below get you from zero to a live connection in about two minutes.
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
              {pingLoading ? "pinging…" : "[ ping server ]"}
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

        {/* BENEFITS · why connect */}
        <section className="mb-14">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-dim">01 · why connect</div>
              <h2 className="text-xl md:text-2xl text-foreground mt-1 font-semibold">
                What you get
              </h2>
            </div>
          </div>
          <div className="grid gap-0 md:grid-cols-2 lg:grid-cols-4 border border-border bg-surface">
            {BENEFITS.map((b, i) => (
              <div
                key={b.k}
                className={`p-5 ${i > 0 ? "border-t md:border-t-0 md:border-l border-border" : ""}`}
              >
                <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
                  ❯ {b.k}
                </div>
                <div className="text-foreground font-semibold text-sm mb-2">{b.t}</div>
                <p className="text-xs text-muted leading-relaxed">{b.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SETUP · clone + install + run. MCP stdio servers spawn locally
            on the caller's machine, so every user needs a local checkout
            before any client config will work. Make that obvious. */}
        <section className="mb-14">
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-widest text-dim">02 · set up swarm locally</div>
            <h2 className="text-xl md:text-2xl text-foreground mt-1 font-semibold">
              Get Swarm running on your machine
            </h2>
            <p className="text-sm text-muted mt-2 max-w-2xl leading-relaxed">
              MCP stdio servers run as a subprocess on your computer, not on ours. Clone the
              repo, install deps, start the API, and your local Swarm is ready to hire agents.
              (If you already have it, skip to step 03.)
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
                01. clone
              </div>
              <p className="text-xs text-muted mb-2 leading-relaxed max-w-2xl">
                Grab the source from GitHub. Node 20+ and npm 10+ are required.
              </p>
              <CodeBlock
                code={`git clone https://github.com/your-org/swarm.git
cd swarm`}
                language="bash"
                filename="terminal"
              />
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
                02. install dependencies
              </div>
              <p className="text-xs text-muted mb-2 leading-relaxed max-w-2xl">
                Installs Next.js, Express, wagmi, RainbowKit, x402, ERC-8004 bindings, and the
                MCP SDK in one go.
              </p>
              <CodeBlock code={`npm install`} language="bash" filename="terminal" />
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
                03. configure environment
              </div>
              <p className="text-xs text-muted mb-2 leading-relaxed max-w-2xl">
                Copy <code className="text-amber font-mono">.env.example</code> to <code className="text-amber font-mono">.env</code>{" "}
                and fill in the keys below. The app reads Avalanche Fuji config, an LLM key, a WalletConnect project id,
                and an orchestrator wallet used to sign x402 payments.
              </p>
              <CodeBlock
                code={`# copy the template
cp .env.example .env

# required · LLM key (Anthropic preferred, Gemini optional fallback)
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=

# required · Avalanche Fuji testnet
AVALANCHE_FUJI_RPC=https://api.avax-test.network/ext/bc/C/rpc
CHAIN_ID=43113
USDC_CONTRACT=0x5425890298aed601595a70AB815c96711a31Bc65

# required · WalletConnect project id (free at https://cloud.reown.com)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id

# required · orchestrator wallet (fund with AVAX + USDC from Fuji faucet)
ORCHESTRATOR_PRIVATE_KEY=0x...
ORCHESTRATOR_ADDRESS=0x...

# optional · already deployed ERC-8004 registries on Fuji
IDENTITY_REGISTRY=0x8004A818BFB912233c491871b3d84c89A494BD9e
REPUTATION_REGISTRY=0x8004B663056A597Dffe9eCcC1965A193B7388713
FACILITATOR_URL=https://facilitator.ultravioletadao.xyz`}
                language="bash"
                filename=".env"
              />
              <div className="mt-2 text-[11px] text-dim">
                Get faucet AVAX and USDC{" "}
                <a
                  className="text-amber hover:text-amber-hi"
                  href="https://build.avax.network/console/primary-network/faucet"
                  target="_blank"
                  rel="noreferrer"
                >
                  from the Fuji faucet ↗
                </a>
                . Your orchestrator wallet needs both to sign x402 payments.
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
                04. start the api + web app
              </div>
              <p className="text-xs text-muted mb-2 leading-relaxed max-w-2xl">
                <code className="text-amber font-mono">npm run dev</code> boots the Next.js UI
                on port 3000 and the Express API on port 4021 via concurrently. The MCP stdio
                server you wire into Claude / Cursor / Codex talks to the Express API.
              </p>
              <CodeBlock code={`npm run dev`} language="bash" filename="terminal" />
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber mb-2">
                05. copy your absolute repo path
              </div>
              <p className="text-xs text-muted mb-2 leading-relaxed max-w-2xl">
                Every client config below points at your local clone with an absolute path.
                Paste yours here so the snippets render correctly.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="/absolute/path/to/swarm"
                  className="flex-1 min-w-[320px] bg-surface-1 border border-border px-3 py-2 text-xs text-foreground placeholder:text-dim focus:outline-none focus:border-amber font-mono"
                />
                <CopyChip value={status?.apiBase || "http://localhost:4021"} display="api base" />
              </div>
              <div className="mt-2 text-[11px] text-dim">
                Hint · run <code className="text-muted font-mono">pwd</code> inside the cloned
                directory and paste the output above.
              </div>
            </div>
          </div>
        </section>

        {/* PLATFORMS */}
        <section className="mb-14">
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-widest text-dim">03 · set up your client</div>
            <h2 className="text-xl md:text-2xl text-foreground mt-1 font-semibold">
              Pick your platform
            </h2>
            <p className="text-xs text-muted mt-2 max-w-2xl leading-relaxed">
              Same MCP server, different config files. Choose the client you already use.
            </p>
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
                config
              </div>
              <CodeBlock
                code={config}
                filename={guide.filename}
                language={guide.language}
              />
              <div className="mt-3 text-[11px] text-dim space-y-1">
                {guide.configLocation.mac && (
                  <div>
                    <span className="uppercase tracking-widest mr-2">macOS</span>
                    <code className="text-muted font-mono">{guide.configLocation.mac}</code>
                  </div>
                )}
                {guide.configLocation.windows && (
                  <div>
                    <span className="uppercase tracking-widest mr-2">Windows</span>
                    <code className="text-muted font-mono">{guide.configLocation.windows}</code>
                  </div>
                )}
                {guide.configLocation.linux && (
                  <div>
                    <span className="uppercase tracking-widest mr-2">Linux</span>
                    <code className="text-muted font-mono">{guide.configLocation.linux}</code>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6">
              <div className="text-[10px] uppercase tracking-widest text-phosphor mb-2">
                verify
              </div>
              <p className="text-sm text-muted leading-relaxed max-w-2xl">
                {guide.verify}
              </p>
            </div>
          </div>
        </section>

        {/* TOOL REFERENCE */}
        <section className="mb-14">
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-widest text-dim">04 · tool reference</div>
            <h2 className="text-xl md:text-2xl text-foreground mt-1 font-semibold">
              The {status?.tools.length ?? 5} tools you get
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
            <div className="text-[11px] uppercase tracking-widest text-dim">05 · further reading</div>
            <h2 className="text-xl md:text-2xl text-foreground mt-1 font-semibold">
              Keep going
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
