import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { config } from "./config";

export const MANUAL_SESSION_COOKIE = "swarm_manual_session";

interface ManualSessionPayload {
  address: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

function secret(): string {
  // Fall back to a process-lifetime random value so dev environments work
  // without manual secret generation. Loses signatures on every restart,
  // which is fine (users re-sign once). Production should set the env var.
  if (!config.manualSessionSecret) {
    const g = globalThis as unknown as { __swarmFallbackSecret?: string };
    if (!g.__swarmFallbackSecret) {
      g.__swarmFallbackSecret = randomBytes(32).toString("hex");
    }
    return g.__swarmFallbackSecret;
  }
  return config.manualSessionSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encode(payload: ManualSessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = sign(body);
  return `${body}.${sig}`;
}

function decode(value: string): ManualSessionPayload | null {
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  // timingSafeEqual requires equal-length buffers; wrap in try/catch so a
  // tampered (short/long) signature fails cleanly rather than throwing.
  try {
    const a = Buffer.from(sig, "base64url");
    const b = Buffer.from(expected, "base64url");
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      parsed &&
      typeof parsed.address === "string" &&
      typeof parsed.issuedAt === "number" &&
      typeof parsed.expiresAt === "number" &&
      typeof parsed.nonce === "string"
    ) {
      if (parsed.expiresAt <= Date.now()) return null;
      return parsed as ManualSessionPayload;
    }
    return null;
  } catch {
    return null;
  }
}

// Mints + persists the cookie. Caller (POST /api/manual-session) is
// responsible for verifying the EIP-191 signature proving wallet ownership.
export async function mintManualSession(address: string): Promise<{ expiresAt: number }> {
  const now = Date.now();
  const ttlMs = Math.max(60, config.manualSessionTtlSeconds) * 1000;
  const payload: ManualSessionPayload = {
    address: address.toLowerCase(),
    issuedAt: now,
    expiresAt: now + ttlMs,
    nonce: randomBytes(8).toString("base64url"),
  };
  const jar = await cookies();
  jar.set({
    name: MANUAL_SESSION_COOKIE,
    value: encode(payload),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
  });
  return { expiresAt: payload.expiresAt };
}

export async function readManualSession(): Promise<{ address: string } | null> {
  const jar = await cookies();
  const raw = jar.get(MANUAL_SESSION_COOKIE)?.value;
  if (!raw) return null;
  const decoded = decode(raw);
  return decoded ? { address: decoded.address } : null;
}

export async function clearManualSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(MANUAL_SESSION_COOKIE);
}
