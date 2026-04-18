import { config } from "@/lib/config";

// Small read-only endpoint the DepositFlow UI hits to learn where users
// should send their USDC. Mirrors the pair/config shape.
export async function GET() {
  return Response.json({
    treasury: config.treasury.address,
    usdc: config.usdcContract,
    chainId: config.chainId,
  });
}
