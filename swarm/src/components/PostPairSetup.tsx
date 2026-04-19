"use client";

import { useState } from "react";
import Link from "next/link";

type ClientKey = "claude-code" | "claude-desktop" | "cursor" | "codex";

interface ClientGuide {
  key: ClientKey;
  label: string;
  kind: "shell" | "json" | "toml" | "deeplink";
  snippet: string;
  note: string;
  deeplink?: string;
}

const CURSOR_DEEPLINK =
  "cursor://anysphere.cursor-deeplink/mcp/install?name=swarm&config=" +
  encodeURIComponent(
    JSON.stringify({
      command: "npx",
      args: ["-y", "swarm-marketplace-mcp"],
    }),
  );

const GUIDES: Record<ClientKey, ClientGuide> = {
  "claude-code": {
    key: "claude-code",
    label: "Claude Code",
    kind: "shell",
    snippet: "claude mcp add swarm -- npx -y swarm-marketplace-mcp",
    note: "Run this in any terminal. Start a new Claude Code session — /mcp should list swarm.",
  },
  "claude-desktop": {
    key: "claude-desktop",
    label: "Claude Desktop",
    kind: "json",
    snippet: `{
  "mcpServers": {
    "swarm": {
      "command": "npx",
      "args": ["-y", "swarm-marketplace-mcp"]
    }
  }
}`,
    note: "Settings → Developer → Edit Config. Paste into claude_desktop_config.json, save, then fully quit and relaunch Claude Desktop.",
  },
  cursor: {
    key: "cursor",
    label: "Cursor",
    kind: "deeplink",
    snippet: "",
    deeplink: CURSOR_DEEPLINK,
    note: "One-click install. If the deeplink doesn't open, go to Settings → MCP and paste the JSON block from /configure.",
  },
  codex: {
    key: "codex",
    label: "Codex",
    kind: "toml",
    snippet: `[mcp_servers.swarm]
command = "npx"
args = ["-y", "swarm-marketplace-mcp"]`,
    note: "Append to ~/.codex/config.toml and restart any open Codex sessions so they re-read the config.",
  },
};

export default function PostPairSetup() {
  const [tab, setTab] = useState<ClientKey>("claude-code");
  const [copied, setCopied] = useState(false);
  const guide = GUIDES[tab];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(guide.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  return (
    <div className="border border-phosphor bg-surface px-4 py-4 space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-phosphor">
          last step · wire up your client
        </div>
        <div className="text-[12px] text-foreground leading-relaxed mt-1">
          Both on-chain setup and funding are done. Pick the client you&apos;ll
          use and paste the snippet — that&apos;s the whole install.
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(GUIDES) as ClientKey[]).map((k) => (
          <button
            key={k}
            onClick={() => {
              setTab(k);
              setCopied(false);
            }}
            className={`text-[11px] px-3 py-1.5 border transition-none ${
              tab === k
                ? "border-phosphor text-phosphor bg-phosphor/10"
                : "border-border text-dim hover:border-foreground hover:text-foreground"
            }`}
          >
            {GUIDES[k].label}
          </button>
        ))}
      </div>

      {guide.kind === "deeplink" ? (
        <a
          href={guide.deeplink}
          className="inline-block border border-phosphor text-background bg-phosphor text-[11px] px-4 py-2 hover:opacity-90 transition-none font-semibold"
        >
          [ add to Cursor ]
        </a>
      ) : (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
            paste this
          </div>
          <div className="flex items-stretch gap-2">
            <pre className="flex-1 min-w-0 border border-border bg-background px-3 py-2 font-mono text-[11px] text-foreground whitespace-pre overflow-x-auto">
              {guide.snippet}
            </pre>
            <button
              onClick={copy}
              className="border border-phosphor bg-phosphor text-background text-[11px] px-3 uppercase tracking-widest hover:opacity-90 transition-none shrink-0"
            >
              {copied ? "copied ✓" : "copy"}
            </button>
          </div>
        </div>
      )}

      <div className="text-[11px] text-dim leading-relaxed">{guide.note}</div>

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-border flex-wrap">
        <Link
          href="/configure"
          className="text-[11px] text-dim hover:text-amber underline"
        >
          full walkthrough at /configure ↗
        </Link>
        <Link
          href="/profile"
          className="border border-phosphor bg-phosphor text-background text-[11px] px-5 py-2 uppercase tracking-widest hover:opacity-90 transition-none font-semibold"
        >
          [ done → go to profile ]
        </Link>
      </div>
    </div>
  );
}
