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

export async function callAgent(systemPrompt: string, userMessage: string): Promise<string> {
  if (!config.googleApiKey || !config.gcpProjectId) {
    throw new Error("No AI provider configured. Set GOOGLE_API_KEY and GCP_PROJECT_ID.");
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
