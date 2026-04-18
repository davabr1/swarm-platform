import type { NextRequest } from "next/server";
import { ethers } from "ethers";
import { config } from "@/lib/config";

const USDC_ABI = ["function balanceOf(address) view returns (uint256)"];

// Chain-sourced USDC balance for the given address on Fuji. Under x402 the
// site no longer custodies balances — the wallet itself (user's or MCP's)
// holds the USDC. Callers hit this for live readouts on profile / pair
// pages; no DB touch, no deposit scan.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const addressRaw = url.searchParams.get("address");
  const address = addressRaw?.toLowerCase();
  if (!address || !/^0x[a-f0-9]{40}$/.test(address)) {
    return Response.json({ error: "Missing or invalid address" }, { status: 400 });
  }

  try {
    const provider = new ethers.JsonRpcProvider(config.rpc);
    const usdc = new ethers.Contract(config.usdcContract, USDC_ABI, provider);
    const micro = (await usdc.balanceOf(address)) as bigint;
    return Response.json({
      address,
      balanceMicroUsd: micro.toString(),
      balanceUsd: (Number(micro) / 1_000_000).toFixed(6),
    });
  } catch (err) {
    return Response.json(
      {
        error: "rpc_error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
