import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { ethers } from "ethers";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { glacierListNative } from "@/lib/avalanche";

// x402 fan-out health dashboard feed. Returns:
//  - recent x402 settle rows (kind="x402_settle") — inbound USDC to platform
//  - recent commission fan-out rows (kind="earning", refType="x402_fanout")
//    with status="confirmed" or "failed" — a failed row is a creator who
//    didn't get paid and needs a [ retry ].
//  - treasury USDC + AVAX balances (AVAX is the gas for fan-out + payouts)
//  - Glacier-sourced recent treasury tx list — independent confirmation
//    that what we think happened on-chain actually happened, sourced from
//    Avalanche's own indexer rather than the same RPC we wrote with.
//  - env sanity block so the dashboard can surface misconfigured deploys.
//
// Auth: same admin password as /api/admin/status. POST + JSON body — GET
// would be harder to protect from browser history leakage.

function equalSafe(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const USDC_ABI = ["function balanceOf(address) view returns (uint256)"];

export async function POST(req: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected) return new Response("admin disabled", { status: 503 });

  let body: { password?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // password stays undefined, 401 below
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || !equalSafe(password, expected)) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const provider = new ethers.JsonRpcProvider(config.rpc);
    const usdc = new ethers.Contract(config.usdcContract, USDC_ABI, provider);

    const treasuryAddress = config.treasury.privateKey
      ? new ethers.Wallet(config.treasury.privateKey).address
      : config.treasury.address;

    const [settles, fanouts, usdcBal, avaxBal, glacierRecent] =
      await Promise.all([
        db.transaction.findMany({
          where: { kind: "x402_settle" },
          orderBy: { createdAt: "desc" },
          take: 25,
        }),
        db.transaction.findMany({
          where: { kind: "earning", refType: "x402_fanout" },
          orderBy: { createdAt: "desc" },
          take: 25,
        }),
        treasuryAddress
          ? (usdc.balanceOf(treasuryAddress) as Promise<bigint>)
          : Promise.resolve(BigInt(0)),
        treasuryAddress
          ? provider.getBalance(treasuryAddress)
          : Promise.resolve(BigInt(0)),
        treasuryAddress
          ? glacierListNative(treasuryAddress, 10).catch((err) => ({
              error: err instanceof Error ? err.message : String(err),
              transactions: [] as never[],
            }))
          : Promise.resolve({
              error: "no treasury address",
              transactions: [] as never[],
            }),
      ]);

    const failedFanouts = fanouts.filter((f) => f.status === "failed").length;

    return Response.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      treasury: {
        address: treasuryAddress || "",
        configured: Boolean(treasuryAddress),
        usdcMicro: usdcBal.toString(),
        usdcUsd: (Number(usdcBal) / 1e6).toFixed(6),
        avaxWei: avaxBal.toString(),
        avax: ethers.formatEther(avaxBal),
      },
      settles: settles.map(serializeTx),
      fanouts: fanouts.map(serializeTx),
      failedFanoutCount: failedFanouts,
      glacier: {
        source: "glacier-api.avax.network",
        transactions: ("transactions" in glacierRecent
          ? glacierRecent.transactions
          : []
        ).map((t) => ({
          txHash: t.txHash,
          blockTimestamp: t.blockTimestamp ?? null,
          from: t.from?.address ?? null,
          to: t.to?.address ?? null,
          value: t.value ?? "0",
          method: t.method?.methodName ?? null,
          status: t.txStatus ?? null,
        })),
        error: "error" in glacierRecent ? glacierRecent.error : null,
      },
      env: {
        rpc: config.rpc,
        rpcSource: process.env.FUJI_RPC_URL
          ? "FUJI_RPC_URL"
          : process.env.AVALANCHE_FUJI_RPC
            ? "AVALANCHE_FUJI_RPC"
            : "default-public",
        chainId: config.chainId,
        caip2: config.caip2,
        usdcContract: config.usdcContract,
        facilitatorMode: (
          process.env.X402_FACILITATOR || "self"
        ).toLowerCase(),
        platformPayoutAddress:
          process.env.PLATFORM_PAYOUT_ADDRESS || config.treasury.address,
      },
    });
  } catch (err) {
    console.error(
      "admin health failed:",
      err instanceof Error ? err.message : err,
    );
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

function serializeTx(t: {
  id: string;
  walletAddress: string;
  kind: string;
  deltaMicroUsd: bigint;
  grossMicroUsd: bigint;
  description: string | null;
  refType: string | null;
  refId: string | null;
  txHash: string | null;
  blockNumber: number | null;
  status: string;
  createdAt: Date;
}) {
  return {
    id: t.id,
    walletAddress: t.walletAddress,
    kind: t.kind,
    deltaMicroUsd: t.deltaMicroUsd.toString(),
    grossMicroUsd: t.grossMicroUsd.toString(),
    description: t.description,
    refType: t.refType,
    refId: t.refId,
    txHash: t.txHash,
    blockNumber: t.blockNumber,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
  };
}

