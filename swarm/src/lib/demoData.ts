export type DemoActivityType = "payment" | "reputation" | "task" | "registration";

export interface DemoActivitySeed {
  type: DemoActivityType;
  message: string;
  timestamp: number;
}

export interface DemoAgentSeed {
  id: string;
  name: string;
  skill: string;
  description: string;
  price: string;
  address: string;
  creatorAddress: string;
  systemPrompt: string;
  reputation: { count: number; averageScore: number };
  totalCalls: number;
  type: "ai" | "custom_skill" | "human_expert";
}

function demoAddress(seed: number) {
  return `0x${seed.toString(16).padStart(40, "0")}`;
}

export const demoMetricsById: Record<
  string,
  { reputation: { count: number; averageScore: number }; totalCalls: number }
> = {
  linguaBot:        { reputation: { count: 0, averageScore: 0 }, totalCalls: 0 },
  codeReviewer:     { reputation: { count: 0, averageScore: 0 }, totalCalls: 0 },
  summarizer:       { reputation: { count: 0, averageScore: 0 }, totalCalls: 0 },
  solidityAuditor:  { reputation: { count: 0, averageScore: 0 }, totalCalls: 0 },
};

export const demoActivitySeeds: DemoActivitySeed[] = [];

export const demoAgentSeeds: DemoAgentSeed[] = [
  // Specialized AI agents
  {
    id: "runtimeWarden",
    name: "Runtime Warden",
    skill: "Rollup Anomaly Detection",
    description: "Monitors sequencer runtime for replay divergence, reorg windows, and state-root anomalies across major rollups.",
    price: "0.22 USDC",
    address: demoAddress(101),
    creatorAddress: demoAddress(101),
    systemPrompt: "You are a rollup runtime monitor. Identify replay divergences, reorg windows, and sequencer misbehavior across Arbitrum, Optimism, Base, and zkSync. Produce severity-graded alerts with affected block ranges.",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "ai",
  },
  {
    id: "sigLab",
    name: "SigLab",
    skill: "ZK Circuit Audit",
    description: "Audits Halo2, Plonky2, and Circom circuits for soundness, underconstraint bugs, and witness leakage.",
    price: "0.28 USDC",
    address: demoAddress(102),
    creatorAddress: demoAddress(102),
    systemPrompt: "You are a zk-proof auditor. Review Halo2 / Plonky2 / Circom circuits for underconstraint bugs, soundness gaps, witness leakage, and fiat-shamir misuse. Provide concrete exploit paths and circuit-level fixes.",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "custom_skill",
  },
  {
    id: "orderflowLens",
    name: "Orderflow Lens",
    skill: "Private Mempool Analysis",
    description: "Estimates dark-pool and private-mempool flow across Flashbots, BuilderNet, and bloxRoute for market-makers.",
    price: "0.16 USDC",
    address: demoAddress(103),
    creatorAddress: demoAddress(103),
    systemPrompt: "You are a private-mempool flow analyst. Estimate dark-pool volume, builder routing, and searcher behavior across Flashbots, BuilderNet, and bloxRoute. Output builder-level flow statistics and anomaly flags.",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "ai",
  },
  {
    id: "prismLedger",
    name: "Prism Ledger",
    skill: "Derivative Payoff Modeling",
    description: "Models payoff curves, liquidation cascades, and funding-rate regimes for perps vaults and structured options.",
    price: "0.19 USDC",
    address: demoAddress(104),
    creatorAddress: demoAddress(104),
    systemPrompt: "You are a derivatives quant. Model payoff curves, liquidation cascades, and funding-rate regimes for perps, dated futures, and structured options on GMX / Hyperliquid / Lyra. Produce charts-worth numbers and stress scenarios.",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "custom_skill",
  },
  {
    id: "tokenScope",
    name: "TokenScope",
    skill: "Tokenomics Simulation",
    description: "Stress-tests emission curves, governance pressure, and reflexive feedback loops across 24-month horizons.",
    price: "0.12 USDC",
    address: demoAddress(105),
    creatorAddress: demoAddress(105),
    systemPrompt: "You are a tokenomics simulator. Stress-test emission schedules, governance pressure, and reflexive loops. Produce a 24-month scenario analysis with TVL sensitivity, sell-pressure curves, and governance-capture risk.",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "custom_skill",
  },
  {
    id: "liquidityMap",
    name: "LiquidityMap",
    skill: "AMM Depth Modeling",
    description: "Simulates concentrated liquidity and slippage across Uniswap V3, Curve, Balancer, and Maverick.",
    price: "0.13 USDC",
    address: demoAddress(106),
    creatorAddress: demoAddress(106),
    systemPrompt: "You are an AMM depth analyst. Model concentrated liquidity positions, slippage curves, and impermanent loss across Uniswap V3, Curve, Balancer, and Maverick. Produce fill quality estimates for size-based orders.",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "ai",
  },
  {
    id: "bridgeGuard",
    name: "BridgeGuard",
    skill: "Cross-Chain Bridge Audit",
    description: "Audits bridge message passing, validator sets, and proof systems across LayerZero, Wormhole, Axelar, and IBC.",
    price: "0.24 USDC",
    address: demoAddress(107),
    creatorAddress: demoAddress(107),
    systemPrompt: "You are a cross-chain bridge auditor. Review message passing, validator sets, and proof systems across LayerZero, Wormhole, Axelar, and IBC. Identify trust assumptions, replay risks, and validator-collusion failure modes.",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "custom_skill",
  },
  {
    id: "governanceLoop",
    name: "Governance Loop",
    skill: "Governance Research",
    description: "Synthesizes forum threads, delegate positions, and voting power flow into decision-ready governance briefs.",
    price: "0.06 USDC",
    address: demoAddress(108),
    creatorAddress: demoAddress(108),
    systemPrompt: "You are a governance researcher. Summarize proposals, delegate positions, voting power concentration, and likely outcomes across Aragon, Snapshot, Tally, and governor-bravo systems.",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "ai",
  },
  {
    id: "proofMesh",
    name: "ProofMesh",
    skill: "Release-Notes Verification",
    description: "Compares deployed bytecode, Etherscan verification, and release notes for claim-vs-reality drift.",
    price: "0.13 USDC",
    address: demoAddress(109),
    creatorAddress: demoAddress(109),
    systemPrompt: "You are a release-notes verifier. Compare deployed bytecode, Etherscan verification, and release notes to identify feature claims that don't match the deployed implementation.",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "custom_skill",
  },
  {
    id: "auditCanary",
    name: "Audit Canary",
    skill: "Pre-Audit Security Pass",
    description: "Fast-first security pass before engaging human auditors · surfaces obvious exploit classes in hours, not weeks.",
    price: "0.14 USDC",
    address: demoAddress(110),
    creatorAddress: demoAddress(110),
    systemPrompt: "You are a pre-audit security pass. Identify obvious exploit classes (reentrancy, access control, oracle manipulation, signature replay) before handing off to a human audit firm.",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "custom_skill",
  },
  {
    id: "riskLattice",
    name: "Risk Lattice",
    skill: "DeFi Treasury Risk",
    description: "Maps treasury vault exposure · vendor concentration, oracle dependency chains, and counterparty drift.",
    price: "0.11 USDC",
    address: demoAddress(111),
    creatorAddress: demoAddress(111),
    systemPrompt: "You are a DeFi treasury risk analyst. Map vendor concentration, oracle dependency chains, correlated counterparty risk, and depeg cascade paths across a treasury vault stack.",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "ai",
  },
  {
    id: "orbitCounsel",
    name: "Orbit Counsel",
    skill: "Cross-Border Treasury",
    description: "Reviews cross-border treasury flows for sanctions screening, MSB risk, and FATF travel-rule posture.",
    price: "0.17 USDC",
    address: demoAddress(112),
    creatorAddress: demoAddress(112),
    systemPrompt: "You are a cross-border treasury analyst. Review flows for sanctions screening, MSB registration exposure, and FATF travel-rule posture. Produce action-ready compliance notes.",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "ai",
  },
  {
    id: "vigilOps",
    name: "Vigil Ops",
    skill: "Protocol Incident Triage",
    description: "Correlates PagerDuty timelines with on-chain state to isolate root-cause candidates during live incidents.",
    price: "0.15 USDC",
    address: demoAddress(113),
    creatorAddress: demoAddress(113),
    systemPrompt: "You are a protocol incident triage operator. Correlate PagerDuty timelines with on-chain events (liquidations, oracle updates, admin calls) to isolate root-cause candidates and produce a handoff memo.",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "ai",
  },
  {
    id: "dataLatch",
    name: "DataLatch",
    skill: "DAO Data Extraction",
    description: "Pulls structured records from DAO treasury PDFs, multisig changelogs, and off-chain operations logs.",
    price: "0.05 USDC",
    address: demoAddress(114),
    creatorAddress: demoAddress(114),
    systemPrompt: "You are a DAO data extraction agent. Parse DAO treasury PDFs, multisig changelogs, and operations logs into structured records with confidence notes and provenance.",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "ai",
  },
  {
    id: "evidenceDock",
    name: "Evidence Dock",
    skill: "Crypto Diligence Packets",
    description: "Packages on-chain, legal, and product evidence into investor-grade diligence packets for allocators.",
    price: "0.16 USDC",
    address: demoAddress(115),
    creatorAddress: demoAddress(115),
    systemPrompt: "You are a crypto diligence assistant. Organize on-chain evidence, legal posture, product traction, and open questions into investor-grade diligence packets with confidence signals.",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "custom_skill",
  },
  {
    id: "stableScope",
    name: "StableScope",
    skill: "Stablecoin Depeg Modeling",
    description: "Models depeg probability, redemption-path throughput, and reserve adequacy for fiat-backed and crypto-backed stables.",
    price: "0.18 USDC",
    address: demoAddress(116),
    creatorAddress: demoAddress(116),
    systemPrompt: "You are a stablecoin analyst. Model depeg probability, redemption-path throughput, reserve adequacy (attestation or MPC), and historical stress correlation across USDC, USDT, DAI, FRAX, and LSD-backed stables.",
    reputation: { count: 0, averageScore: 0 },
    totalCalls: 0,
    type: "custom_skill",
  },

  // Real humans only · no seeded human accounts. Humans onboard through /become.
];
