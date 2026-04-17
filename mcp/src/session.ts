/**
 * MCP session pairing.
 *
 * On boot we load any cached session and, if none, kick off pairing in the
 * background: print the pair URL to stderr, try to open it in the user's
 * default browser, and poll /api/pair/claim until the browser claims the
 * code. Tool calls fast-return a "please pair" message whenever the
 * session isn't ready yet — they never block the stdio response.
 *
 * The on-chain USDC allowance the user signed during pairing is the hard
 * cap. `spentUsd` tracking on the backend is advisory; the MCP doesn't
 * mirror it.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rm, chmod } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const SWARM_API = process.env.SWARM_API_URL || "https://swarm-psi.vercel.app";
const CONFIG_DIR = join(homedir(), ".swarm-mcp");
const SESSION_FILE = join(CONFIG_DIR, "session.json");
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export interface Session {
  token: string;
  address: string;
  budgetUsd: number;
  expiresAt: string;
}

let currentSession: Session | null = null;
let pairingActive = false;
let lastPairUrl: string | null = null;

export function pairUrl(code: string): string {
  return `${SWARM_API}/pair?code=${code}`;
}

export function generatePairCode(): string {
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

export async function saveSession(session: Session): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(SESSION_FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
  try {
    await chmod(SESSION_FILE, 0o600);
  } catch {
    // best-effort on exotic filesystems
  }
}

async function clearSession(): Promise<void> {
  try {
    await rm(SESSION_FILE, { force: true });
  } catch {
    // ignore
  }
}

// Fire-and-forget browser opener. Opt out via SWARM_MCP_NO_OPEN=1 for
// headless envs (CI, remote SSH) where spawning `open` would error.
export function tryOpenBrowser(url: string): void {
  if (process.env.SWARM_MCP_NO_OPEN === "1") return;
  try {
    const p = platform();
    const [cmd, args] =
      p === "darwin"
        ? ["open", [url]]
        : p === "win32"
          ? ["cmd", ["/c", "start", "", url]]
          : ["xdg-open", [url]];
    const proc = spawn(cmd as string, args as string[], {
      stdio: "ignore",
      detached: true,
    });
    proc.on("error", () => {
      // Most common cause: xdg-open not installed on a minimal Linux.
      // Harmless — the URL still printed to stderr.
    });
    proc.unref();
  } catch {
    // best-effort
  }
}

export async function pollForClaim(code: string): Promise<Session | null> {
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
        return null;
      }
    } catch {
      // transient — keep polling
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

function startPairingInBackground(): void {
  if (pairingActive || currentSession) return;
  pairingActive = true;
  const code = generatePairCode();
  const url = pairUrl(code);
  lastPairUrl = url;

  // Print prominently to stderr — Claude Code's MCP log pane shows this.
  console.error("");
  console.error("━".repeat(60));
  console.error(" Swarm MCP needs wallet authorization (one-time).");
  console.error("");
  console.error(`   ${url}`);
  console.error("");
  console.error(" Opening this URL in your browser now. If it doesn't open,");
  console.error(" copy the link above. Connect your wallet, pick a USDC");
  console.error(" budget, and sign — the MCP picks up the session within 2s.");
  console.error("━".repeat(60));
  console.error("");

  tryOpenBrowser(url);

  void (async () => {
    try {
      const session = await pollForClaim(code);
      if (session) {
        currentSession = session;
        await saveSession(session);
        console.error(
          `\n✓ Swarm MCP paired as ${session.address.slice(0, 8)}... · ${session.budgetUsd.toFixed(2)} USDC budget · expires ${new Date(session.expiresAt).toISOString()}\n`,
        );
      } else {
        // Timed out — drop the URL so the next tool call can generate a
        // fresh code instead of trying to claim a stale one.
        lastPairUrl = null;
      }
    } finally {
      pairingActive = false;
    }
  })();
}

/**
 * Called once at server boot. Loads a cached session if one exists; else
 * kicks off the pairing flow in the background. Returns immediately so the
 * stdio transport can come up without delay.
 */
export async function initSession(): Promise<void> {
  const cached = await loadSession();
  if (cached) {
    currentSession = cached;
    console.error(
      `Swarm MCP paired as ${cached.address.slice(0, 8)}... · ${cached.budgetUsd.toFixed(2)} USDC budget`,
    );
    return;
  }
  startPairingInBackground();
}

/**
 * Non-blocking session check for tool handlers. If there is no active
 * session and no pairing flow in-flight, re-kick pairing so a fresh URL
 * appears in logs. Always returns fast.
 */
export function requireSession(): { session: Session | null; pairUrl: string | null } {
  if (!currentSession && !pairingActive) {
    startPairingInBackground();
  }
  return { session: currentSession, pairUrl: lastPairUrl };
}

export function getCurrentSession(): Session | null {
  return currentSession;
}

export function swarmApiUrl(): string {
  return SWARM_API;
}

/**
 * Prepends SWARM_API, injects the bearer token if paired. A 401 from the
 * server means the token was revoked or expired server-side — drop the
 * local copy and kick off re-pairing so the next tool call can recover.
 */
export async function swarmFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  if (currentSession) headers.set("authorization", `Bearer ${currentSession.token}`);
  const res = await fetch(`${SWARM_API}${path}`, { ...init, headers });
  if (res.status === 401) {
    currentSession = null;
    await clearSession();
    startPairingInBackground();
  }
  return res;
}
