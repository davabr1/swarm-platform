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
