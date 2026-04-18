import { ethers } from "ethers";
import { config } from "./config";
import MCPRegistryABI from "@/abis/MCPRegistry.json";

// Thin reader over the MCPRegistry contract on Fuji.
//
// Writes (register/unregister) happen in the browser via wagmi — the user
// signs with their main wallet. Server only needs to read: "which MCPs does
// this owner have registered?" and "who owns this MCP?"

export function mcpRegistryAddress(): string | null {
  return process.env.NEXT_PUBLIC_MCP_REGISTRY_ADDRESS || null;
}

let readProvider: ethers.JsonRpcProvider | null = null;
function provider(): ethers.JsonRpcProvider {
  if (!readProvider) readProvider = new ethers.JsonRpcProvider(config.rpc);
  return readProvider;
}

function contract(): ethers.Contract | null {
  const addr = mcpRegistryAddress();
  if (!addr) return null;
  return new ethers.Contract(addr, MCPRegistryABI, provider());
}

export interface PairedMcp {
  address: string;
  pairedAt: number;
}

// Returns [] when the registry isn't deployed — callers render an empty
// state rather than erroring, so profile pages keep working pre-deploy.
export async function listMcps(owner: string): Promise<PairedMcp[]> {
  const c = contract();
  if (!c) return [];
  try {
    const addresses = (await c.getMCPs(owner)) as string[];
    if (addresses.length === 0) return [];
    const pairedAts = await Promise.all(
      addresses.map(async (addr) => {
        const ts = (await c.pairedAt(addr)) as bigint;
        return Number(ts);
      }),
    );
    return addresses.map((a, i) => ({
      address: a.toLowerCase(),
      pairedAt: pairedAts[i],
    }));
  } catch (err) {
    console.error(
      "mcpRegistry.listMcps failed:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export async function ownerOfMcp(mcp: string): Promise<string | null> {
  const c = contract();
  if (!c) return null;
  try {
    const owner = (await c.ownerOf(mcp)) as string;
    if (owner === ethers.ZeroAddress) return null;
    return owner.toLowerCase();
  } catch {
    return null;
  }
}
