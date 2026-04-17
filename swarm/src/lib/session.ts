import "server-only";
import { ethers } from "ethers";
import type { McpSession } from "@prisma/client";
import { db } from "./db";
import { config } from "./config";

// NOTE: session tokens are stored raw for hackathon simplicity. Production
// systems should store a sha256 of the token and compare hashes so a DB leak
// doesn't yield live bearer credentials. Phase 0 does NOT do that.

const USDC_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
] as const;

let readProvider: ethers.JsonRpcProvider | null = null;
function provider(): ethers.JsonRpcProvider {
  if (!readProvider) readProvider = new ethers.JsonRpcProvider(config.rpc);
  return readProvider;
}

export type SessionResolution =
  | { kind: "session"; session: McpSession }
  | { kind: "anonymous" }
  | { kind: "invalid_token"; reason: "unknown" | "revoked" | "expired" };

// Returns a discriminated result so callers can distinguish "no auth
// header at all" (browser UI / anonymous caller, serve normally without
// settlement) from "auth header present but bad" (revoked or expired MCP
// token — MUST 401 so the MCP's session.ts:swarmFetch drops the local
// session and re-pairs). Without this distinction a revoked token was
// getting served as if anonymous.
export async function resolveSession(req: Request): Promise<SessionResolution> {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) return { kind: "anonymous" };
  const token = header.slice(7).trim();
  if (!token) return { kind: "invalid_token", reason: "unknown" };
  const session = await db.mcpSession.findUnique({ where: { token } });
  if (!session) return { kind: "invalid_token", reason: "unknown" };
  if (session.revokedAt) return { kind: "invalid_token", reason: "revoked" };
  if (session.expiresAt.getTime() <= Date.now()) return { kind: "invalid_token", reason: "expired" };
  return { kind: "session", session };
}

// Legacy shim — returns null for anonymous AND invalid-token callers.
// Prefer resolveSession() for routes that need to 401 on bad tokens.
export async function getSessionFromRequest(req: Request): Promise<McpSession | null> {
  const r = await resolveSession(req);
  return r.kind === "session" ? r.session : null;
}

export async function incrementSpent(sessionId: string, costUsd: number): Promise<void> {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return;
  await db.mcpSession.update({
    where: { id: sessionId },
    data: { spentUsd: { increment: costUsd } },
  });
}

export async function readAllowance(owner: string): Promise<bigint> {
  const usdc = new ethers.Contract(config.usdcContract, USDC_ABI, provider());
  const value = (await usdc.allowance(owner, config.orchestrator.address)) as bigint;
  return value;
}

export const EIP712_DOMAIN = {
  name: "Swarm",
  version: "1",
  chainId: config.chainId,
};

export const EIP712_TYPES: Record<string, ethers.TypedDataField[]> = {
  PairAuthorization: [
    { name: "code", type: "string" },
    { name: "address", type: "address" },
    { name: "budgetMicroUsd", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
    { name: "chainId", type: "uint256" },
  ],
};

export function verifyPairSignature(params: {
  code: string;
  address: string;
  budgetMicroUsd: bigint;
  expiresAt: number;
  signature: string;
}): boolean {
  const recovered = ethers.verifyTypedData(
    EIP712_DOMAIN,
    EIP712_TYPES,
    {
      code: params.code,
      address: params.address,
      budgetMicroUsd: params.budgetMicroUsd,
      expiresAt: params.expiresAt,
      chainId: config.chainId,
    },
    params.signature,
  );
  return recovered.toLowerCase() === params.address.toLowerCase();
}

export function verifyRevokeSignature(params: {
  sessionId: string;
  issuedAt: number;
  address: string;
  signature: string;
}): boolean {
  const message = `Swarm session revoke: ${params.sessionId}@${params.issuedAt}`;
  const recovered = ethers.verifyMessage(message, params.signature);
  return recovered.toLowerCase() === params.address.toLowerCase();
}
