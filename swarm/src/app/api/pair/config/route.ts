import { config } from "@/lib/config";

// Public addresses the /pair page needs client-side (orchestrator as
// approve spender, USDC as approve target). Served from a route so we
// don't have to plumb a NEXT_PUBLIC_* env var for every deploy.
export async function GET() {
  return Response.json({
    orchestrator: config.orchestrator.address,
    usdc: config.usdcContract,
    chainId: config.chainId,
  });
}
