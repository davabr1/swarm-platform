/**
 * MCP wallet + x402 client.
 *
 * Holds a single locally-minted secp256k1 keypair that IS the MCP's wallet.
 * The user funds this address directly with USDC on Fuji; every paid tool
 * call signs an EIP-3009 `transferWithAuthorization` with this key and
 * settles via x402 in ~2 seconds — no bearer tokens, no cookies, no
 * treasury custody.
 *
 * Session file: ~/.swarm-mcp/session.json (mode 0600).
 * Shape: { privateKey: "0x...", address: "0x...", createdAt: ISO }.
 * Sweep residual USDC by importing the private key into any wallet app.
 */

import { mkdir, readFile, writeFile, rm, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createPublicClient, http } from "viem";
import { avalancheFuji } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { networkIDs } from "@avalabs/avalanchejs";

const SWARM_API = process.env.SWARM_API_URL || "https://swarm-psi.vercel.app";
// Fuji C-Chain RPC. `FUJI_RPC_URL` points at AvaCloud in prod; dev falls
// back to the public RPC. `avalanchejs` gives us the human-readable
// network tag we show in diagnostics.
const FUJI_RPC = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
export const FUJI_NETWORK_TAG = networkIDs.FujiHRP; // "fuji"
const CONFIG_DIR = join(homedir(), ".swarm-mcp");
const SESSION_FILE = join(CONFIG_DIR, "session.json");

const USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65" as const;
const USDC_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface McpKey {
  privateKey: `0x${string}`;
  address: `0x${string}`;
  createdAt: string;
}

let cachedKey: McpKey | null = null;
let cachedFetch: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null = null;

async function loadKey(): Promise<McpKey | null> {
  try {
    const raw = await readFile(SESSION_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<McpKey>;
    if (
      typeof parsed.privateKey !== "string" ||
      !parsed.privateKey.startsWith("0x") ||
      typeof parsed.address !== "string"
    ) {
      return null;
    }
    return {
      privateKey: parsed.privateKey as `0x${string}`,
      address: parsed.address as `0x${string}`,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function saveKey(key: McpKey): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(SESSION_FILE, JSON.stringify(key, null, 2), { mode: 0o600 });
  try {
    await chmod(SESSION_FILE, 0o600);
  } catch {
    // best-effort on exotic filesystems
  }
}

export async function clearKey(): Promise<void> {
  cachedKey = null;
  cachedFetch = null;
  try {
    await rm(SESSION_FILE, { force: true });
  } catch {
    // ignore
  }
}

export async function peekSavedKey(): Promise<McpKey | null> {
  return loadKey();
}

export async function getOrCreateKey(): Promise<McpKey> {
  if (cachedKey) return cachedKey;
  const existing = await loadKey();
  if (existing) {
    cachedKey = existing;
    return existing;
  }
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const key: McpKey = {
    privateKey,
    address: account.address,
    createdAt: new Date().toISOString(),
  };
  await saveKey(key);
  cachedKey = key;
  return key;
}

export function getCachedKey(): McpKey | null {
  return cachedKey;
}

export function swarmApiUrl(): string {
  return SWARM_API;
}

function buildWrappedFetch(key: McpKey) {
  const account = privateKeyToAccount(key.privateKey);
  const publicClient = createPublicClient({
    chain: avalancheFuji,
    transport: http(FUJI_RPC),
  });
  const scheme = new ExactEvmScheme(
    toClientEvmSigner(account, publicClient),
  );
  const client = new x402Client().register("eip155:43113", scheme);
  return wrapFetchWithPayment(fetch, client);
}

/**
 * Reads the on-chain USDC balance of the MCP's address. Returns null on RPC
 * error — callers treat null as "unknown" and don't block the user.
 */
export async function usdcBalance(address: `0x${string}`): Promise<bigint | null> {
  try {
    const pc = createPublicClient({
      chain: avalancheFuji,
      transport: http(FUJI_RPC),
    });
    const bal = (await pc.readContract({
      address: USDC_FUJI,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [address],
    })) as bigint;
    return bal;
  } catch {
    return null;
  }
}

/**
 * Fetches a URL on swarm's API, auto-handling 402 via x402. Paid routes
 * get their `X-PAYMENT` header signed with the MCP's key; free routes
 * pass through without payment. `X-Asker-Address` is attached so the site
 * can attribute activity back to this MCP's wallet on free endpoints too.
 */
export async function swarmFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = await getOrCreateKey();
  if (!cachedFetch) cachedFetch = buildWrappedFetch(key);
  const headers = new Headers(init.headers ?? {});
  headers.set("X-Asker-Address", key.address);
  return cachedFetch(`${SWARM_API}${path}`, { ...init, headers });
}
