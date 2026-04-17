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
import { useAccount } from "wagmi";
import PairModal from "./PairModal";

// Cookie-free per-wallet session store. Production systems should move
// these tokens to httpOnly + SameSite=Strict cookies — localStorage is
// XSS-vulnerable. For a hackathon demo it's the simplest unified store
// that survives tab reloads and scales to multi-wallet switching.
const STORAGE_KEY = "swarm:sessions";

interface StoredSession {
  token: string;
  address: string;
  budgetUsd: number;
  expiresAt: string; // ISO
}

type SessionMap = Record<string, StoredSession>;

function readAll(): SessionMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as SessionMap;
  } catch {
    // malformed — drop it
  }
  return {};
}

function writeAll(map: SessionMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // best-effort (private browsing, quota, etc.)
  }
}

function storedFor(address: string | undefined): StoredSession | null {
  if (!address) return null;
  const map = readAll();
  const s = map[address.toLowerCase()];
  if (!s) return null;
  if (new Date(s.expiresAt).getTime() <= Date.now()) return null;
  return s;
}

function saveFor(address: string, session: StoredSession) {
  const map = readAll();
  map[address.toLowerCase()] = session;
  writeAll(map);
}

function clearFor(address: string | undefined) {
  if (!address) return;
  const map = readAll();
  delete map[address.toLowerCase()];
  writeAll(map);
}

interface SessionContextValue {
  token: string | null;
  address: string | null;
  budgetUsd: number;
  expiresAt: Date | null;
  needsPairing: boolean;
  /** Resolves with the current token, opening the pair modal if needed. Resolves null if the user cancels. */
  ensureSession: () => Promise<string | null>;
  /** Force-clear the cached session for the connected wallet — used after a 401. */
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
  const [session, setSession] = useState<StoredSession | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const pendingResolvers = useRef<Array<(token: string | null) => void>>([]);

  // Re-read localStorage whenever the connected wallet changes.
  useEffect(() => {
    if (!isConnected || !address) {
      setSession(null);
      return;
    }
    setSession(storedFor(address));
  }, [address, isConnected]);

  const clearSession = useCallback(() => {
    clearFor(address ?? undefined);
    setSession(null);
  }, [address]);

  const openModal = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      pendingResolvers.current.push(resolve);
      setModalOpen(true);
    });
  }, []);

  const resolveAll = useCallback((value: string | null) => {
    const resolvers = pendingResolvers.current;
    pendingResolvers.current = [];
    for (const r of resolvers) r(value);
  }, []);

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (!isConnected || !address) {
      // No wallet connected — can't pair. Caller should prompt ConnectButton.
      return null;
    }
    const existing = storedFor(address);
    if (existing) {
      setSession(existing);
      return existing.token;
    }
    return openModal();
  }, [address, isConnected, openModal]);

  const handleModalSuccess = useCallback(
    (result: {
      sessionToken: string;
      address: string;
      budgetUsd: number;
      expiresAt: string;
    }) => {
      const stored: StoredSession = {
        token: result.sessionToken,
        address: result.address,
        budgetUsd: result.budgetUsd,
        expiresAt: result.expiresAt,
      };
      saveFor(result.address, stored);
      setSession(stored);
      setModalOpen(false);
      resolveAll(result.sessionToken);
    },
    [resolveAll],
  );

  const handleModalCancel = useCallback(() => {
    setModalOpen(false);
    resolveAll(null);
  }, [resolveAll]);

  const value = useMemo<SessionContextValue>(
    () => ({
      token: session?.token ?? null,
      address: session?.address ?? null,
      budgetUsd: session?.budgetUsd ?? 0,
      expiresAt: session ? new Date(session.expiresAt) : null,
      needsPairing: isConnected && !!address && !session,
      ensureSession,
      clearSession,
    }),
    [session, isConnected, address, ensureSession, clearSession],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <PairModal open={modalOpen} onSuccess={handleModalSuccess} onCancel={handleModalCancel} />
    </Ctx.Provider>
  );
}
