import { SWARM_MCP_TOOLS, SWARM_MCP_VERSION } from "@/lib/mcpTools";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  return Response.json({
    status: "ready",
    version: SWARM_MCP_VERSION,
    tools: SWARM_MCP_TOOLS.map((t) => t.name),
    toolDefs: SWARM_MCP_TOOLS,
    transports: ["stdio"],
    apiBase: `${url.protocol}//${url.host}`,
  });
}
