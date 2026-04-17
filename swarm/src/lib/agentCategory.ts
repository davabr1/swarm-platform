import type { Agent } from "@/lib/api";

// Four-way category bucket used by the marketplace card, the agent
// detail page, and anywhere else we render an agent badge. This is the
// single source of truth for "what category is this agent" — it
// supersedes the raw `type` column because a user-created AI agent
// with an Image skill still reads as "img-gen" from the user's POV.
//
// Priority ordered:
//   human_expert  → always `human` (green)
//   skill "Image" → `img-gen` (pink), regardless of ownership
//   userCreated    → `custom` (amber) — independent-wallet agents
//   default        → `ai` (blue) — platform-seeded AI agents
//
// Colors reuse existing theme tokens (see globals.css): phosphor,
// danger, amber, info.
export type AgentCategory = "human" | "img-gen" | "custom" | "ai";

export function getCategory(agent: Pick<Agent, "type" | "skill" | "userCreated">): AgentCategory {
  if (agent.type === "human_expert") return "human";
  if (agent.skill.startsWith("Image")) return "img-gen";
  if (agent.userCreated) return "custom";
  return "ai";
}

// `custom` is user-facing label "custom ai" (the enum key stays `custom`
// so filter URLs, internal code, and theme tokens don't churn). Only the
// human-readable string changes — see marketplace filter + agent badge.
export const CATEGORY_LABEL: Record<AgentCategory, string> = {
  human: "human",
  "img-gen": "img-gen",
  custom: "custom ai",
  ai: "ai",
};

export const CATEGORY_TEXT: Record<AgentCategory, string> = {
  human: "text-phosphor",
  "img-gen": "text-danger",
  custom: "text-amber",
  ai: "text-info",
};

export const CATEGORY_BG: Record<AgentCategory, string> = {
  human: "bg-phosphor",
  "img-gen": "bg-danger",
  custom: "bg-amber",
  ai: "bg-info",
};
