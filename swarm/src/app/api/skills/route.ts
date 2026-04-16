import { db } from "@/lib/db";
import { SKILL_CATALOG } from "@/lib/skills";

export async function GET() {
  const [agentSkills, taskSkills] = await Promise.all([
    db.agent.findMany({ select: { skill: true }, distinct: ["skill"] }),
    db.task.findMany({ select: { skill: true }, distinct: ["skill"] }),
  ]);
  const inUse = Array.from(
    new Set(
      [...agentSkills, ...taskSkills]
        .map((r) => r.skill)
        .filter((s): s is string => typeof s === "string" && s.length > 0),
    ),
  ).sort();
  return Response.json({ catalog: [...SKILL_CATALOG], inUse });
}
