import { SWARM_MCP_VERSION } from "./tools.js";

const PACKAGE_NAME = "swarm-marketplace-mcp";
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const UPDATE_COMMAND = `npm install -g ${PACKAGE_NAME}@latest`;
const FETCH_TIMEOUT_MS = 5000;

export type UpdateStatus = {
  current: string;
  latest: string;
  updateAvailable: boolean;
  command: string;
};

let cached: UpdateStatus | null = null;
let inFlight: Promise<UpdateStatus | null> | null = null;

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

async function fetchLatest(): Promise<UpdateStatus | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(REGISTRY_URL, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    const latest = typeof data.version === "string" ? data.version : null;
    if (!latest) return null;
    const status: UpdateStatus = {
      current: SWARM_MCP_VERSION,
      latest,
      updateAvailable: compareSemver(latest, SWARM_MCP_VERSION) > 0,
      command: UPDATE_COMMAND,
    };
    cached = status;
    return status;
  } catch {
    return null;
  }
}

export function startBackgroundCheck(): void {
  if (inFlight) return;
  inFlight = fetchLatest();
}

export async function getUpdateStatus(): Promise<UpdateStatus | null> {
  if (cached) return cached;
  if (!inFlight) inFlight = fetchLatest();
  return inFlight;
}

export function getCachedUpdateStatus(): UpdateStatus | null {
  return cached;
}

export function updateBanner(): string | null {
  const s = cached;
  if (!s || !s.updateAvailable) return null;
  return `⚠ swarm-mcp update available: ${s.current} → ${s.latest} · run: ${s.command}`;
}
