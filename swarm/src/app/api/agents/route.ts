import { db } from "@/lib/db";
import { serializeAgent } from "@/lib/serializeAgent";

export async function GET() {
  const agents = await db.agent.findMany({
    orderBy: [{ reputation: "desc" }, { totalCalls: "desc" }],
  });
  return Response.json(agents.map(serializeAgent));
}
