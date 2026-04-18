import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { ethers } from "ethers";
import { db } from "@/lib/db";
import { config } from "@/lib/config";

function equalSafe(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const USDC_ABI = ["function balanceOf(address) view returns (uint256)"];

interface WalletReadout {
  address: string;
  configured: boolean;
  usdcMicro: string;
  usdcUsd: string;
  avaxWei: string;
  avax: string;
}

async function readWallet(
  provider: ethers.JsonRpcProvider,
  usdc: ethers.Contract,
  address: string,
): Promise<WalletReadout> {
  if (!address) {
    return {
      address: "",
      configured: false,
      usdcMicro: "0",
      usdcUsd: "0.000000",
      avaxWei: "0",
      avax: "0",
    };
  }
  const [usdcBal, avaxBal] = await Promise.all([
    usdc.balanceOf(address) as Promise<bigint>,
    provider.getBalance(address),
  ]);
  return {
    address,
    configured: true,
    usdcMicro: usdcBal.toString(),
    usdcUsd: (Number(usdcBal) / 1e6).toFixed(6),
    avaxWei: avaxBal.toString(),
    avax: ethers.formatEther(avaxBal),
  };
}

export async function POST(req: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected) return new Response("admin disabled", { status: 503 });

  let body: { password?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Fall through — password stays undefined, 401 below.
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || !equalSafe(password, expected)) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const provider = new ethers.JsonRpcProvider(config.rpc);
    const usdc = new ethers.Contract(config.usdcContract, USDC_ABI, provider);

    const [treasury, orchestrator, head, cursor] = await Promise.all([
      readWallet(provider, usdc, config.treasury.address),
      readWallet(provider, usdc, config.orchestrator.address),
      provider.getBlockNumber(),
      db.depositScanCursor.findUnique({ where: { id: "usdc" } }),
    ]);

    return Response.json({
      ok: true,
      treasury,
      orchestrator,
      scan: {
        lastBlock: cursor?.lastBlock ?? null,
        headBlock: head,
        gap: cursor ? head - cursor.lastBlock : null,
      },
      usdcContract: config.usdcContract,
      rpc: config.rpc,
      chainId: config.chainId,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("admin status failed:", err instanceof Error ? err.message : err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
