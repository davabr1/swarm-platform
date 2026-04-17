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

export const REPLY_ENVELOPE_DIRECTIVE = `Respond with a single JSON object, no prose outside it, no Markdown code fences. Two valid shapes:
{"type":"question","text":"…one clarifying question you need answered to respond well…"}
{"type":"response","text":"…your final answer…"}
Use "question" only when the missing context would materially change your answer. Otherwise use "response".`;

export async function callAgent(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  if (!config.googleApiKey) {
    throw new Error("No AI provider configured. Set GOOGLE_API_KEY.");
  }

  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `${systemPrompt}\n\nUser request: ${userMessage}`,
    config: {
      thinkingConfig: { thinkingBudget: -1 },
    },
  });

  return response.text || "No response generated.";
}

export type GeminiUsage = {
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
};

export async function callAgentWithUsage(
  systemPrompt: string,
  userMessage: string,
): Promise<{ text: string; usage: GeminiUsage }> {
  if (!config.googleApiKey) {
    throw new Error("No AI provider configured. Set GOOGLE_API_KEY.");
  }

  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `${systemPrompt}\n\nUser request: ${userMessage}`,
    config: {
      thinkingConfig: { thinkingBudget: -1 },
    },
  });

  const text = response.text || "No response generated.";
  const meta = response.usageMetadata ?? {};
  const usage: GeminiUsage = {
    promptTokens: meta.promptTokenCount ?? 0,
    outputTokens: meta.candidatesTokenCount ?? 0,
    thoughtsTokens: meta.thoughtsTokenCount ?? 0,
  };
  return { text, usage };
}

export type SpecialistReply = {
  type: "question" | "response";
  text: string;
  usage: GeminiUsage;
};

function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (fenced) return fenced[1];
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

export async function callAgentStructured(
  systemPrompt: string,
  userMessage: string,
): Promise<SpecialistReply> {
  const combined = `${systemPrompt}\n\n${REPLY_ENVELOPE_DIRECTIVE}`;
  const { text: raw, usage } = await callAgentWithUsage(combined, userMessage);

  const candidate = extractJsonObject(raw) ?? raw;
  try {
    const parsed = JSON.parse(candidate);
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed.type === "question" || parsed.type === "response") &&
      typeof parsed.text === "string" &&
      parsed.text.trim().length > 0
    ) {
      return { type: parsed.type, text: parsed.text.trim(), usage };
    }
  } catch {
    // fall through
  }
  return { type: "response", text: raw.trim(), usage };
}
