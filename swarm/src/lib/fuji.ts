export const USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65" as const;
export const FUJI_CHAIN_ID = 43113;
export const MCP_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_MCP_REGISTRY_ADDRESS || "") as
  | `0x${string}`
  | "";

export const USDC_ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
