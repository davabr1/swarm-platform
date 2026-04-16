import { GoogleGenAI } from "@google/genai";
import { config } from "./config";

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      vertexai: true,
      apiKey: config.googleApiKey,
    });
  }
  return geminiClient;
}

const FORMAT_DIRECTIVE = `Respond in PLAIN TEXT ONLY. Do NOT use Markdown — no asterisks for emphasis, no # headers, no backtick code fences, no bullet glyphs. Keep answers terse, action-oriented, and high-signal. Lead with the answer. If something needs structure, use indented lines or numbered steps, not Markdown. Most responses should be 3–8 short lines.`;

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*```[a-zA-Z]*\s*$/gm, "")
    .trim();
}

type CallAgentOptions = {
  // When true, skips the plain-text format directive and markdown stripping.
  // Use for callers that need structured output (JSON, etc.).
  structured?: boolean;
};

export async function callAgent(
  systemPrompt: string,
  userMessage: string,
  options: CallAgentOptions = {}
): Promise<string> {
  if (!config.googleApiKey) {
    throw new Error("No AI provider configured. Set GOOGLE_API_KEY.");
  }

  const ai = getGeminiClient();
  const contents = options.structured
    ? `${systemPrompt}\n\nUser request: ${userMessage}`
    : `${systemPrompt}\n\n${FORMAT_DIRECTIVE}\n\nUser request: ${userMessage}`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents,
    config: {
      thinkingConfig: { thinkingBudget: -1 },
    },
  });

  const text = response.text || "No response generated.";
  return options.structured ? text : stripMarkdown(text);
}

export type GeminiUsage = {
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
};

export async function callAgentWithUsage(
  systemPrompt: string,
  userMessage: string,
  options: CallAgentOptions = {}
): Promise<{ text: string; usage: GeminiUsage }> {
  if (!config.googleApiKey) {
    throw new Error("No AI provider configured. Set GOOGLE_API_KEY.");
  }

  const ai = getGeminiClient();
  const contents = options.structured
    ? `${systemPrompt}\n\nUser request: ${userMessage}`
    : `${systemPrompt}\n\n${FORMAT_DIRECTIVE}\n\nUser request: ${userMessage}`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents,
    config: {
      thinkingConfig: { thinkingBudget: -1 },
    },
  });

  const raw = response.text || "No response generated.";
  const text = options.structured ? raw : stripMarkdown(raw);
  const meta = response.usageMetadata ?? {};
  const usage: GeminiUsage = {
    promptTokens: meta.promptTokenCount ?? 0,
    outputTokens: meta.candidatesTokenCount ?? 0,
    thoughtsTokens: meta.thoughtsTokenCount ?? 0,
  };
  return { text, usage };
}
