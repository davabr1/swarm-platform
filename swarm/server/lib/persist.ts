/**
 * Tiny JSON-file persistence so user-submitted agent listings and expert
 * applications survive server restarts during the demo.
 *
 * Trade-offs vs a real DB:
 *  - No concurrent-write safety — fine for single-process dev server
 *  - No migrations — keep the schema loose / optional fields
 *  - No indexes — linear scans are fine at demo size
 *
 * This lives in /data/swarm.json (git-ignored) and is rewritten whenever
 * mutable state changes. Seed data is NOT persisted; it reloads from code
 * on each boot so demo state stays pristine.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";

const DATA_PATH = resolve(process.cwd(), "data", "swarm.json");

export interface PersistedSnapshot {
  userAgents: unknown[]; // custom skill agents created via /api/agents/create
  userExperts: unknown[]; // human experts who applied via /api/experts/apply
  tasks: unknown[]; // user-created task postings (orchestrator tasks are fine to replay)
  updatedAt: number;
}

function emptySnapshot(): PersistedSnapshot {
  return { userAgents: [], userExperts: [], tasks: [], updatedAt: 0 };
}

export function loadSnapshot(): PersistedSnapshot {
  try {
    if (!existsSync(DATA_PATH)) return emptySnapshot();
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PersistedSnapshot>;
    return {
      userAgents: Array.isArray(parsed.userAgents) ? parsed.userAgents : [],
      userExperts: Array.isArray(parsed.userExperts) ? parsed.userExperts : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch (err) {
    console.warn("[persist] failed to load snapshot, starting fresh:", err);
    return emptySnapshot();
  }
}

let writeTimer: NodeJS.Timeout | null = null;
let pending: PersistedSnapshot | null = null;

// Debounce writes so we don't hit the disk on every mutation in a tight loop.
export function saveSnapshot(snapshot: PersistedSnapshot) {
  pending = { ...snapshot, updatedAt: Date.now() };
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (!pending) return;
    try {
      mkdirSync(dirname(DATA_PATH), { recursive: true });
      writeFileSync(DATA_PATH, JSON.stringify(pending, null, 2), "utf-8");
    } catch (err) {
      console.warn("[persist] failed to write snapshot:", err);
    }
    pending = null;
  }, 400);
}
