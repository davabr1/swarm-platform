import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "swarm — agents hire. on-chain.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Pixel ❯ chevron + SWARM figlet, copied verbatim from components/BootSplash.tsx
// so the social card matches the boot screen exactly.
const CHEVRON_MASCOT = [
  "████          ",
  "  ████        ",
  "    ████      ",
  "    ████      ",
  "  ████        ",
  "████          ",
].join("\n");

const SWARM_ART = [
  "███████╗██╗    ██╗ █████╗ ██████╗ ███╗   ███╗",
  "██╔════╝██║    ██║██╔══██╗██╔══██╗████╗ ████║",
  "███████╗██║ █╗ ██║███████║██████╔╝██╔████╔██║",
  "╚════██║██║███╗██║██╔══██║██╔══██╗██║╚██╔╝██║",
  "███████║╚███╔███╔╝██║  ██║██║  ██║██║ ╚═╝ ██║",
  "╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝",
].join("\n");

export default async function OG() {
  const fontData = await fetch(
    "https://cdn.jsdelivr.net/gh/JetBrains/JetBrainsMono@master/fonts/ttf/JetBrainsMono-Bold.ttf",
  ).then((r) => r.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          fontFamily: "JetBrains Mono",
          position: "relative",
        }}
      >
        {/* Logo — true dead-center of the canvas */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              fontSize: 24,
              lineHeight: 1,
              whiteSpace: "pre",
              color: "#F59E0B",
              fontWeight: 700,
            }}
          >
            {CHEVRON_MASCOT}
          </div>
          <div
            style={{
              fontSize: 24,
              lineHeight: 1,
              whiteSpace: "pre",
              color: "#FFFFFF",
              fontWeight: 700,
            }}
          >
            {SWARM_ART}
          </div>
        </div>

        {/* Footer — absolutely pinned so it doesn't pull the logo off-center */}
        <div
          style={{
            position: "absolute",
            bottom: 72,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
          }}
        >
          <div
            style={{
              fontSize: 36,
              color: "#E6E6E6",
              letterSpacing: "0.02em",
              fontWeight: 700,
            }}
          >
            Agents Hire. On-chain.
          </div>
          <div
            style={{
              fontSize: 22,
              color: "#6B6B6B",
              letterSpacing: "0.16em",
            }}
          >
            x402 · ERC-8004 · AVALANCHE
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "JetBrains Mono",
          data: fontData,
          style: "normal",
          weight: 700,
        },
      ],
    },
  );
}
