import { GoogleGenAI } from "@google/genai";
import { config } from "./config";

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return geminiClient;
}

export async function callAgent(systemPrompt: string, userMessage: string): Promise<string> {
  if (!config.geminiApiKey) {
    throw new Error("No AI provider configured. Set GEMINI_API_KEY.");
  }

  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: `${systemPrompt}\n\nUser request: ${userMessage}`,
  });

  return response.text || "No response generated.";
}
