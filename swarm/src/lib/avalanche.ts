// Avalanche Fuji constants, Glacier (Avalanche's indexer) client, and
// Snowtrace URL helpers. Centralized so no other file hardcodes the chain
// id, RPC URL, or Snowtrace host — grepping for those strings should land
// here and nowhere else.
//
// `@avalabs/avalanchejs` gives us the consensus-layer Fuji identifiers
// (FujiHRP, FujiID). EVM-side chainId 43113 is separate — the EVM subnet
// of the primary network uses its own id which we keep in this module.

import { networkIDs } from "@avalabs/avalanchejs";

// EVM C-Chain chain id on Fuji testnet. Not the avalanchejs consensus
// FujiID (=5); that's the primary-network id, not the EVM subnet.
export const FUJI_CHAIN_ID = 43113;
export const FUJI_CAIP2 = "eip155:43113";

// Consensus-layer identifiers from the official SDK. Exported so anything
// doing P/X-chain work (none yet, but Phase-6-adjacent) pulls from here
// rather than hardcoding. Also confirms our dep tree actually uses the
// Avalanche SDK for more than its presence.
export const FUJI_NETWORK_HRP = networkIDs.FujiHRP; // "fuji"
export const FUJI_NETWORK_ID = networkIDs.FujiID; // 5

// Default RPC fallback for local dev. In prod this should point at AvaCloud
// (or another dedicated RPC) via FUJI_RPC_URL — the public endpoint rate-
// limits hard under any real load.
const DEFAULT_FUJI_RPC = "https://api.avax-test.network/ext/bc/C/rpc";

export function fujiRpcUrl(): string {
  return (
    process.env.FUJI_RPC_URL ||
    process.env.AVALANCHE_FUJI_RPC ||
    DEFAULT_FUJI_RPC
  );
}

const SNOWTRACE_TX_BASE = "https://testnet.snowtrace.io/tx/";
const SNOWTRACE_ADDR_BASE = "https://testnet.snowtrace.io/address/";

export function snowtraceTxUrl(txHash: string): string {
  return `${SNOWTRACE_TX_BASE}${txHash}`;
}

export function snowtraceAddressUrl(address: string): string {
  return `${SNOWTRACE_ADDR_BASE}${address}`;
}

// Glacier — Avalanche's official indexer. REST only; the avalanchejs SDK
// (5.0.0) is consensus-layer and does not ship a Glacier client, so we
// call the HTTP API directly. Base URL is stable.
const GLACIER_BASE = "https://glacier-api.avax.network/v1";

export interface GlacierNativeTx {
  blockHash?: string;
  blockNumber?: string;
  blockTimestamp?: number;
  txHash: string;
  txStatus?: string;
  txType?: number;
  gasLimit?: string;
  gasUsed?: string;
  gasPrice?: string;
  nonce?: string;
  from?: { address: string };
  to?: { address: string };
  value?: string;
  method?: { methodHash?: string; callType?: string; methodName?: string };
}

export interface GlacierNativeListResponse {
  transactions: GlacierNativeTx[];
  nextPageToken?: string;
}

// Lists native (C-Chain EVM) transactions touching an address on Fuji.
// Used by /api/admin/health to show recent treasury activity sourced from
// Avalanche's own indexer rather than a hand-rolled eth_getLogs scan.
export async function glacierListNative(
  address: string,
  pageSize = 20,
): Promise<GlacierNativeListResponse> {
  const url =
    `${GLACIER_BASE}/chains/${FUJI_CHAIN_ID}/addresses/` +
    `${address}/transactions:listNative?pageSize=${pageSize}`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`glacier listNative ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as GlacierNativeListResponse;
}
