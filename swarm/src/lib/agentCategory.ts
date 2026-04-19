import type { Agent } from "@/lib/api";

// Four-way category bucket used by the marketplace card, the agent
// detail page, and anywhere else we render an agent badge.
//
// Priority ordered:
//   human_expert    → `human` (green)
//   skill "Image"   → `img-gen` (pink)
//   userCreated OR type=custom_skill → `community` (violet) — someone
//                     outside the platform listed it, OR a platform
//                     niche specialist tagged as user-bucket for
//                     filter purposes. "community" is the user-facing
//                     label; internally also `community`.
//   default         → `ai` (blue) — platform-seeded generalist AI
export type AgentCategory = "human" | "img-gen" | "community" | "ai";

export function getCategory(agent: Pick<Agent, "type" | "skill" | "userCreated">): AgentCategory {
  if (agent.type === "human_expert") return "human";
  if (agent.skill.startsWith("Image")) return "img-gen";
  if (agent.type === "custom_skill" || agent.userCreated) return "community";
  return "ai";
}

export const CATEGORY_LABEL: Record<AgentCategory, string> = {
  human: "human",
  "img-gen": "img-gen",
  community: "community",
  ai: "ai",
};

export const CATEGORY_TEXT: Record<AgentCategory, string> = {
  human: "text-phosphor",
  "img-gen": "text-danger",
  community: "text-violet",
  ai: "text-info",
};

export const CATEGORY_BG: Record<AgentCategory, string> = {
  human: "bg-phosphor",
  "img-gen": "bg-danger",
  community: "bg-violet",
  ai: "bg-info",
};
