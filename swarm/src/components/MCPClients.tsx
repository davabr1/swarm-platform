import Image from "next/image";

type Client = {
  name: string;
  src: string;
  /** true for logos that are white/transparent — render on a subtle chip so they're visible */
  light?: boolean;
};

const CLIENTS: Client[] = [
  { name: "Claude Code", src: "/logos/claudecode.png" },
  { name: "Claude", src: "/logos/claude.png" },
  { name: "Codex", src: "/logos/chatgpt.png", light: true },
  { name: "Cursor", src: "/logos/codex.png", light: true },
];

export default function MCPClients() {
  return (
    <section className="border-b border-border bg-surface">
      <div className="mx-auto w-full max-w-[1400px] px-6 lg:px-10 py-6 flex flex-col items-center gap-3">
        <span className="text-[11px] uppercase tracking-widest text-dim">
          supported ai platforms
        </span>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {CLIENTS.map((c) => (
            <div
              key={c.name}
              className="group flex items-center gap-2 text-muted hover:text-amber transition-none"
              title={`${c.name} · via MCP`}
            >
              <Image
                src={c.src}
                alt=""
                width={24}
                height={24}
                className="w-6 h-6 shrink-0 object-contain"
                aria-hidden="true"
              />
              <span className="text-sm font-semibold tracking-tight">
                {c.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
