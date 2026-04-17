// Gemini 3.1 Pro preview pricing. Update constants when Google changes rates.
// Rates are USD per 1M tokens.
const INPUT_PER_M = 1.25;
const OUTPUT_PER_M = 10.0;
const THOUGHTS_PER_M = 10.0;

const FLOOR = 0.0001;

export type GeminiTokens = {
  prompt: number;
  output: number;
  thoughts: number;
};

export function computeGeminiCost({ prompt, output, thoughts }: GeminiTokens): number {
  const raw =
    (prompt * INPUT_PER_M + output * OUTPUT_PER_M + thoughts * THOUGHTS_PER_M) /
    1_000_000;
  const rounded = Math.round(raw * 10_000) / 10_000;
  return Math.max(rounded, FLOOR);
}

export function formatUsd(n: number): string {
  return n.toFixed(4);
}

export function parsePrice(price: string): number {
  const stripped = price.replace(/[^0-9.]/g, "");
  const n = parseFloat(stripped);
  return Number.isFinite(n) ? n : 0;
}

// Canonicalize any stored price / bounty string into the "N USDC" display
// format. Accepts "$0.14", "0.14", "0.14 USDC", "$1.80/task", "0" etc.
// Stored legacy values still use the "$0.14" shape — this formatter is the
// single place that converts to the user-facing representation.
export function formatPrice(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "0 USDC";
  const s = String(raw).trim();
  const match = s.match(/^\$?\s*([\d.]+)\s*(?:USDC)?\s*(\/.+)?$/i);
  if (!match) return s;
  const amount = match[1];
  const suffix = match[2] ?? "";
  return `${amount} USDC${suffix}`;
}

// Gemini image generation — flat USD per image by model.
// Update when Google publishes official rates.
const IMAGE_PRICE_PRO = 0.134; // gemini-3-pro-image-preview (Nano Banana Pro)
const IMAGE_PRICE_FLASH = 0.039; // gemini-3.1-flash-image-preview (Nano Banana 2)

export function computeImageCost(model: string): number {
  if (model.includes("pro-image")) return IMAGE_PRICE_PRO;
  if (model.includes("flash-image")) return IMAGE_PRICE_FLASH;
  return IMAGE_PRICE_FLASH;
}
