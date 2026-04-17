/**
 * MCP session pairing.
 *
 * On boot the MCP looks for ~/.swarm-mcp/session.json. If it's missing or
 * expired, it generates a fresh pair code, prints a URL to stderr, and
 * polls the backend until the user claims it from the browser. The session
 * token returned by the claim is persisted (mode 0600) and injected as
 * `Authorization: Bearer <token>` on every swarm fetch.
 *
 * The server-side hard cap is the on-chain USDC allowance the user signed
 * during pairing. `spentUsd` tracking here is advisory — the backend
 * decrements it for its own 402 gate, we don't mirror it client-side.
 */

import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rm, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const SWARM_API = process.env.SWARM_API_URL || "https://swarm-psi.vercel.app";
const CONFIG_DIR = join(homedir(), ".swarm-mcp");
const SESSION_FILE = join(CONFIG_DIR, "session.json");
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes — user has time to open the link

export interface Session {
  token: string;
  address: string;
  budgetUsd: number;
  expiresAt: string; // ISO-8601
}

function pairUrl(code: string): string {
  return `${SWARM_API}/pair?code=${code}`;
}

function generatePairCode(): string {
  return `pair_${randomBytes(16).toString("base64url")}`;
}

async function loadSession(): Promise<Session | null> {
  try {
    const raw = await readFile(SESSION_FILE, "utf8");
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.token || !parsed.address || !parsed.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveSession(session: Session): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(SESSION_FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
  // chmod separately for systems where writeFile's mode is ignored on overwrite.
  try {
    await chmod(SESSION_FILE, 0o600);
  } catch {
    // best-effort on exotic filesystems
  }
}

export async function clearSession(): Promise<void> {
  try {
    await rm(SESSION_FILE, { force: true });
  } catch {
    // ignore
  }
}

let currentSession: Session | null = null;
let pairingPromise: Promise<Session | null> | null = null;
let lastPairUrl: string | null = null;

export function pairUrlHint(): string | null {
  return lastPairUrl;
}

async function pollForClaim(code: string): Promise<Session | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${SWARM_API}/api/pair/claim?code=${encodeURIComponent(code)}`);
      if (res.ok) {
        const data = (await res.json()) as Partial<Session> & {
          claimed?: boolean;
          sessionToken?: string;
        };
        if (data.claimed && data.sessionToken && data.address && data.expiresAt) {
          return {
            token: data.sessionToken,
            address: data.address,
            budgetUsd: typeof data.budgetUsd === "number" ? data.budgetUsd : 0,
            expiresAt: data.expiresAt,
          };
        }
      } else if (res.status === 410) {
        // code consumed or expired — give up, caller will regenerate
        return null;
      }
    } catch {
      // transient network blip — keep polling
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

async function startPairing(): Promise<Session | null> {
  const code = generatePairCode();
  lastPairUrl = pairUrl(code);
  console.error(`\nSwarm MCP is not paired yet.\n  Open ${lastPairUrl}\n  in a browser to authorize a USDC budget, then retry your tool call.\n`);
  const session = await pollForClaim(code);
  if (!session) return null;
  await saveSession(session);
  console.error(`Swarm MCP paired as ${session.address.slice(0, 8)}... · $${session.budgetUsd.toFixed(2)} budget · expires ${new Date(session.expiresAt).toISOString()}`);
  return session;
}

/**
 * Returns a live session or null if we're still unpaired. Starts (or joins)
 * a single in-flight pairing flow so repeated tool calls during the
 * pairing window don't fan out into multiple pair codes.
 */
export async function ensureSession(): Promise<Session | null> {
  if (currentSession && new Date(currentSession.expiresAt).getTime() > Date.now()) {
    return currentSession;
  }
  const cached = await loadSession();
  if (cached) {
    currentSession = cached;
    return cached;
  }
  if (!pairingPromise) {
    pairingPromise = startPairing().finally(() => {
      pairingPromise = null;
    });
  }
  const session = await pairingPromise;
  currentSession = session;
  return session;
}

/**
 * Prepends SWARM_API, injects the bearer token if paired. On 401 the local
 * session file is wiped so the next tool call re-pairs cleanly.
 */
export async function swarmFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const session = currentSession ?? (await loadSession());
  if (session) currentSession = session;
  const headers = new Headers(init.headers ?? {});
  if (session) headers.set("authorization", `Bearer ${session.token}`);
  const res = await fetch(`${SWARM_API}${path}`, { ...init, headers });
  if (res.status === 401) {
    await clearSession();
    currentSession = null;
  }
  return res;
}

export function swarmApiUrl(): string {
  return SWARM_API;
}
