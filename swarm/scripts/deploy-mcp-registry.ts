/* eslint-disable @typescript-eslint/no-require-imports */
// Compile + deploy MCPRegistry.sol to Fuji.
//
// Run: `npx tsx swarm/scripts/deploy-mcp-registry.ts`
// Requires: TREASURY_PRIVATE_KEY + AVALANCHE_FUJI_RPC (or FUJI_RPC_URL) in env.
//
// Writes the resulting ABI to src/abis/MCPRegistry.json (shipped into the
// Next.js bundle) and prints the deployed address for pinning into
// NEXT_PUBLIC_MCP_REGISTRY_ADDRESS. Idempotent only in that re-running
// deploys a *new* copy — there's no proxy/upgrade mechanism by design.

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createWalletClient, createPublicClient, http } from "viem";
import { avalancheFuji } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// solc ships as CJS; import via createRequire for ESM compat
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const solc = require("solc");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function compile() {
  const source = readFileSync(
    join(ROOT, "contracts/MCPRegistry.sol"),
    "utf8",
  );
  const input = {
    language: "Solidity",
    sources: { "MCPRegistry.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object"] },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors?.some((e: { severity: string }) => e.severity === "error")) {
    console.error(output.errors);
    throw new Error("solc compile failed");
  }
  const contract = output.contracts["MCPRegistry.sol"].MCPRegistry;
  return {
    abi: contract.abi as unknown[],
    bytecode: `0x${contract.evm.bytecode.object}` as `0x${string}`,
  };
}

async function main() {
  const rpc =
    process.env.FUJI_RPC_URL ||
    process.env.AVALANCHE_FUJI_RPC ||
    "https://api.avax-test.network/ext/bc/C/rpc";
  const pk = process.env.TREASURY_PRIVATE_KEY;
  if (!pk) throw new Error("TREASURY_PRIVATE_KEY required");

  const account = privateKeyToAccount(pk as `0x${string}`);
  const wallet = createWalletClient({
    account,
    chain: avalancheFuji,
    transport: http(rpc),
  });
  const pub = createPublicClient({
    chain: avalancheFuji,
    transport: http(rpc),
  });

  console.log(`[deploy] compiling MCPRegistry.sol…`);
  const { abi, bytecode } = compile();

  // Persist the ABI so the Next.js side can import it.
  const abiPath = join(ROOT, "src/abis/MCPRegistry.json");
  mkdirSync(dirname(abiPath), { recursive: true });
  writeFileSync(abiPath, JSON.stringify(abi, null, 2) + "\n");
  console.log(`[deploy] abi → ${abiPath}`);

  console.log(`[deploy] deploying from ${account.address}…`);
  const hash = await wallet.deployContract({
    abi,
    bytecode,
    args: [],
  });
  console.log(`[deploy] tx: ${hash}`);
  console.log(`[deploy] https://testnet.snowtrace.io/tx/${hash}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) {
    throw new Error("no contract address in receipt");
  }
  console.log(`\n✅ deployed: ${receipt.contractAddress}`);
  console.log(`\nadd to .env:`);
  console.log(`NEXT_PUBLIC_MCP_REGISTRY_ADDRESS=${receipt.contractAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
