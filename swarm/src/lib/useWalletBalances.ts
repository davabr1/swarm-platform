"use client";

import { useReadContract } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { formatUnits } from "viem";

const USDC_ADDRESS =
  (process.env.NEXT_PUBLIC_USDC_CONTRACT as `0x${string}` | undefined) ||
  "0x5425890298aed601595a70AB815c96711a31Bc65";

// Minimal ERC-20 balanceOf ABI — inlined so we don't drag the full Circle
// USDC artifact into the client bundle.
const erc20BalanceOfAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface WalletBalances {
  usdc: { formatted: string; loading: boolean };
}

/**
 * Fetches USDC balance for a Fuji address. AVAX intentionally omitted —
 * x402 settlements are gasless for the payer (facilitator covers it), so
 * AVAX balance isn't user-facing info. Use `undefined` address to no-op.
 */
export function useWalletBalances(
  address: `0x${string}` | undefined
): WalletBalances {
  const usdc = useReadContract({
    abi: erc20BalanceOfAbi,
    address: USDC_ADDRESS,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: avalancheFuji.id,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });

  const usdcFormatted =
    typeof usdc.data === "bigint"
      ? Number(formatUnits(usdc.data, 6)).toFixed(2)
      : "—";

  return {
    usdc: { formatted: usdcFormatted, loading: usdc.isLoading },
  };
}
