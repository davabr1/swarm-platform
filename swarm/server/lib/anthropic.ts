import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { config } from "./config";

let geminiClient: GoogleGenAI | null = null;
let anthropicClient: Anthropic | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return geminiClient;
}

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return anthropicClient;
}

export async function callAgent(systemPrompt: string, userMessage: string): Promise<string> {
  if (config.geminiApiKey) {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `${systemPrompt}\n\nUser request: ${userMessage}`,
    });

    return response.text || "No response generated.";
  }

  if (config.anthropicApiKey) {
    const ai = getAnthropicClient();
    const response = await ai.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return text || "No response generated.";
  }

  throw new Error("No AI provider configured. Set GEMINI_API_KEY or ANTHROPIC_API_KEY.");
}
