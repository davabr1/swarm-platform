"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccount, useSignMessage } from "wagmi";
import { mintManualSession } from "@/lib/api";

// Browser manual-session manager. The HTTP cookie itself is httpOnly +
// signed server-side (see lib/manualSession.ts); all we track here is a
// local marker so the UI knows whether to prompt for a wallet signature
// before the first paid call.
//
// Storage stores only { address, expiresAt } — no secret material. If
// localStorage and the server-side cookie drift (e.g. user cleared
// cookies), the next paid call returns 401 and the UI can clear our
// flag and prompt again.
const STORAGE_KEY = "swarm:manual-sessions";

interface StoredFlag {
  address: string;
  expiresAt: number; // epoch ms
}

type FlagMap = Record<string, StoredFlag>;

function readAll(): FlagMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as FlagMap;
  } catch {
    // malformed — drop it
  }
  return {};
}

function writeAll(map: FlagMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // best-effort (private browsing, quota, etc.)
  }
}

function flagFor(address: string | undefined): StoredFlag | null {
  if (!address) return null;
  const map = readAll();
  const s = map[address.toLowerCase()];
  if (!s) return null;
  if (s.expiresAt <= Date.now()) return null;
  return s;
}

function saveFlag(flag: StoredFlag) {
  const map = readAll();
  map[flag.address.toLowerCase()] = flag;
  writeAll(map);
}

function clearFlag(address: string | undefined) {
  if (!address) return;
  const map = readAll();
  delete map[address.toLowerCase()];
  writeAll(map);
}

interface SessionContextValue {
  address: string | null;
  expiresAt: Date | null;
  hasSession: boolean;
  needsPairing: boolean;
  /**
   * Ensures a manual-session cookie is minted for the connected wallet.
   * Prompts for a single signature the first time; subsequent calls are
   * in-memory. Resolves true on success, false on cancel / error.
   */
  ensureSession: () => Promise<boolean>;
  /** Force-clear the cached session marker (e.g. after a 401). */
  clearSession: () => void;
}

const Ctx = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside <SessionProvider>");
  return v;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const [flag, setFlag] = useState<StoredFlag | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      setFlag(null);
      return;
    }
    setFlag(flagFor(address));
  }, [address, isConnected]);

  const clearSession = useCallback(() => {
    clearFlag(address ?? undefined);
    setFlag(null);
  }, [address]);

  const { signMessageAsync } = useSignMessage();

  const ensureSession = useCallback(async (): Promise<boolean> => {
    if (!isConnected || !address) return false;
    const existing = flagFor(address);
    if (existing) {
      setFlag(existing);
      return true;
    }
    // Single-flight: if a prompt is already open, piggyback on it.
    if (inFlight.current) return inFlight.current;
    const p = (async (): Promise<boolean> => {
      try {
        const issuedAt = Date.now();
        const normalized = address.toLowerCase();
        const message = `Swarm manual session: ${normalized}@${issuedAt}`;
        const signature = await signMessageAsync({ message });
        const result = await mintManualSession({
          address: normalized,
          issuedAt,
          signature,
        });
        const stored: StoredFlag = {
          address: result.address,
          expiresAt: result.expiresAt,
        };
        saveFlag(stored);
        setFlag(stored);
        return true;
      } catch {
        return false;
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = p;
    return p;
  }, [address, isConnected, signMessageAsync]);

  const value = useMemo<SessionContextValue>(
    () => ({
      address: flag?.address ?? null,
      expiresAt: flag ? new Date(flag.expiresAt) : null,
      hasSession: !!flag,
      needsPairing: isConnected && !!address && !flag,
      ensureSession,
      clearSession,
    }),
    [flag, isConnected, address, ensureSession, clearSession],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
