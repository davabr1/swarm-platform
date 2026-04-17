import { GoogleGenAI, Modality } from "@google/genai";
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

export type GeminiImageUsage = {
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
};

export type GeminiImageResult = {
  base64: string;
  mimeType: string;
  usage: GeminiImageUsage;
};

// Hard directive prepended to every image call. Tells the model its job
// is to OUTPUT PIXELS, not commentary. Gemini image-preview models will
// sometimes write a paragraph describing what they would draw instead of
// drawing it — this kills that failure mode.
const IMAGE_ONLY_DIRECTIVE =
  "You are an image-generation model. OUTPUT AN IMAGE ONLY. " +
  "Do not ask clarifying questions. Do not write captions, explanations, " +
  "safety disclaimers, or any text describing the image. Render the prompt " +
  "as a visual image. If the prompt is ambiguous, make a reasonable " +
  "interpretation and render it — do not respond in text.";

function extractImagePart(
  response: Awaited<ReturnType<ReturnType<typeof getGeminiClient>["models"]["generateContent"]>>,
) {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  const textPart = parts.find((p) => p.text)?.text;
  return { imagePart, textPart, parts };
}

export async function generateImage(
  systemPrompt: string,
  userPrompt: string,
  model: string,
): Promise<GeminiImageResult> {
  if (!config.googleApiKey) {
    throw new Error("No AI provider configured. Set GOOGLE_API_KEY.");
  }

  const ai = getGeminiClient();

  // Stack: IMAGE_ONLY_DIRECTIVE (highest priority, hard rule) + agent
  // style prompt + user prompt. Order matters — the directive must come
  // FIRST so it's treated as the system-level instruction.
  const basePrompt = systemPrompt
    ? `${IMAGE_ONLY_DIRECTIVE}\n\n${systemPrompt}\n\nImage prompt: ${userPrompt}`
    : `${IMAGE_ONLY_DIRECTIVE}\n\nImage prompt: ${userPrompt}`;

  // Gemini image-preview models require BOTH modalities in the response
  // config; IMAGE-only triggers silent text fallback. We allow TEXT so
  // the API accepts the request, but the directive above tells the
  // model not to actually use it.
  const callOnce = async (prompt: string) =>
    ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

  let response = await callOnce(basePrompt);
  let { imagePart, textPart } = extractImagePart(response);

  // First attempt returned text instead of image. Retry ONCE with an
  // even more insistent prompt that references what the model just did
  // wrong. One retry is enough — if the second try also fails, the model
  // genuinely can't generate this (safety refusal, region gating, or
  // model doesn't actually support image output).
  if (!imagePart?.inlineData?.data) {
    const retryPrompt =
      `${IMAGE_ONLY_DIRECTIVE}\n\n` +
      `Your previous response was text. This is wrong. You MUST output ` +
      `raw image data via the inlineData response part. Render the ` +
      `following prompt as a single image now:\n\n` +
      (systemPrompt ? `${systemPrompt}\n\n` : "") +
      `Image prompt: ${userPrompt}`;
    response = await callOnce(retryPrompt);
    ({ imagePart, textPart } = extractImagePart(response));
  }

  if (!imagePart?.inlineData?.data) {
    const detail = textPart
      ? `Gemini (${model}) returned text instead of an image after 2 attempts: ${textPart.slice(0, 400)}`
      : `Gemini (${model}) returned no image data after 2 attempts. Likely causes: ` +
        `(1) model not enabled in your Vertex/AI Studio project, ` +
        `(2) region lacks image-preview quota, ` +
        `(3) safety filter blocked the prompt.`;
    throw new Error(detail);
  }

  const meta = response.usageMetadata ?? {};
  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType ?? "image/png",
    usage: {
      promptTokens: meta.promptTokenCount ?? 0,
      outputTokens: meta.candidatesTokenCount ?? 0,
      thoughtsTokens: meta.thoughtsTokenCount ?? 0,
    },
  };
}
