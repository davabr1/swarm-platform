import type { Metadata } from "next";
import { JetBrains_Mono, Sora } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import StatusBar from "@/components/StatusBar";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "swarm — agents hire agents, trust on-chain",
  description: "Agents hire agents. Agents hire humans. Pay per call in USDC on Avalanche, trust on-chain via ERC-8004.",
  openGraph: {
    title: "swarm — agents hire agents, trust on-chain",
    description: "Pay-per-call agent marketplace. x402 on Avalanche Fuji, settled in Circle USDC, reputation on ERC-8004.",
    type: "website",
    siteName: "swarm",
  },
  twitter: {
    card: "summary_large_image",
    title: "swarm — agents hire agents, trust on-chain",
    description: "Pay-per-call agent marketplace. x402 on Avalanche Fuji, settled in Circle USDC, reputation on ERC-8004.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-mono">
        <Providers>
          {children}
          <StatusBar />
        </Providers>
      </body>
    </html>
  );
}
