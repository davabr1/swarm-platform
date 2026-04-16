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

const now = Date.now();

function demoAddress(seed: number) {
  return `0x${seed.toString(16).padStart(40, "0")}`;
}

function activityAt(minutesAgo: number) {
  return now - minutesAgo * 60_000;
}

export const demoMetricsById: Record<
  string,
  { reputation: { count: number; averageScore: number }; totalCalls: number }
> = {
  // Four built-in specialized agents (keys are kept for backwards-compat with config.ts)
  linguaBot:        { reputation: { count: 186, averageScore: 4.9 }, totalCalls: 1422 }, // Chainsight · On-Chain Forensics
  codeReviewer:     { reputation: { count: 164, averageScore: 4.8 }, totalCalls: 1108 }, // Solmantis · Solidity Exploit Detection
  summarizer:       { reputation: { count: 201, averageScore: 4.7 }, totalCalls: 1804 }, // MEV Scope · MEV & Orderflow
  solidityAuditor:  { reputation: { count: 61, averageScore: 4.9 }, totalCalls: 318 },   // RegulaNet · Regulatory
  humanExpert:      { reputation: { count: 37, averageScore: 4.8 }, totalCalls: 92 },
};

export const demoActivitySeeds: DemoActivitySeed[] = [
  {
    type: "payment",
    message: "Chainsight closed 0.14 USDC tracing a 9-hop exit path through Tornado into a CEX deposit.",
    timestamp: activityAt(1),
  },
  {
    type: "task",
    message: "An agent escalated a proxy storage-collision review with a $3.40 bounty.",
    timestamp: activityAt(3),
  },
  {
    type: "reputation",
    message: "Solmantis hit 4.95/5 after catching a delegatecall trap in a v2 staking upgrade.",
    timestamp: activityAt(5),
  },
  {
    type: "registration",
    message: "SigLab joined as a zk-proof verification and Halo2 circuit audit custom-skill agent.",
    timestamp: activityAt(7),
  },
  {
    type: "payment",
    message: "MEV Scope routed 0.09 USDC for a sandwich attack trace across Uniswap V3 blocks.",
    timestamp: activityAt(9),
  },
  {
    type: "reputation",
    message: "RegulaNet moved to 4.8/5 after a MiCA risk classification for a euro-USDC frontend.",
    timestamp: activityAt(12),
  },
  {
    type: "task",
    message: "Aria Stone claimed a tokenomics edge-case review for a $3.10 restaking bounty.",
    timestamp: activityAt(14),
  },
  {
    type: "payment",
    message: "Runtime Warden billed 0.22 USDC on runtime anomaly detection for a rollup sequencer.",
    timestamp: activityAt(17),
  },
  {
    type: "registration",
    message: "Prism Ledger registered · derivative payoff modeling for perps and option vaults.",
    timestamp: activityAt(21),
  },
  {
    type: "reputation",
    message: "Audit Canary crossed 300 fast-first security passes at 4.9/5.",
    timestamp: activityAt(26),
  },
];

export const demoAgentSeeds: DemoAgentSeed[] = [
  // Specialized AI agents
  {
    id: "runtimeWarden",
    name: "Runtime Warden",
    skill: "Rollup Anomaly Detection",
    description: "Monitors sequencer runtime for replay divergence, reorg windows, and state-root anomalies across major rollups.",
    price: "$0.22",
    address: demoAddress(101),
    creatorAddress: demoAddress(101),
    systemPrompt: "You are a rollup runtime monitor. Identify replay divergences, reorg windows, and sequencer misbehavior across Arbitrum, Optimism, Base, and zkSync. Produce severity-graded alerts with affected block ranges.",
    reputation: { count: 93, averageScore: 4.8 },
    totalCalls: 604,
    type: "ai",
  },
  {
    id: "sigLab",
    name: "SigLab",
    skill: "ZK Circuit Audit",
    description: "Audits Halo2, Plonky2, and Circom circuits for soundness, underconstraint bugs, and witness leakage.",
    price: "$0.28",
    address: demoAddress(102),
    creatorAddress: demoAddress(102),
    systemPrompt: "You are a zk-proof auditor. Review Halo2 / Plonky2 / Circom circuits for underconstraint bugs, soundness gaps, witness leakage, and fiat-shamir misuse. Provide concrete exploit paths and circuit-level fixes.",
    reputation: { count: 48, averageScore: 4.9 },
    totalCalls: 212,
    type: "custom_skill",
  },
  {
    id: "orderflowLens",
    name: "Orderflow Lens",
    skill: "Private Mempool Analysis",
    description: "Estimates dark-pool and private-mempool flow across Flashbots, BuilderNet, and bloxRoute for market-makers.",
    price: "$0.16",
    address: demoAddress(103),
    creatorAddress: demoAddress(103),
    systemPrompt: "You are a private-mempool flow analyst. Estimate dark-pool volume, builder routing, and searcher behavior across Flashbots, BuilderNet, and bloxRoute. Output builder-level flow statistics and anomaly flags.",
    reputation: { count: 74, averageScore: 4.8 },
    totalCalls: 402,
    type: "ai",
  },
  {
    id: "prismLedger",
    name: "Prism Ledger",
    skill: "Derivative Payoff Modeling",
    description: "Models payoff curves, liquidation cascades, and funding-rate regimes for perps vaults and structured options.",
    price: "$0.19",
    address: demoAddress(104),
    creatorAddress: demoAddress(104),
    systemPrompt: "You are a derivatives quant. Model payoff curves, liquidation cascades, and funding-rate regimes for perps, dated futures, and structured options on GMX / Hyperliquid / Lyra. Produce charts-worth numbers and stress scenarios.",
    reputation: { count: 89, averageScore: 4.9 },
    totalCalls: 412,
    type: "custom_skill",
  },
  {
    id: "tokenScope",
    name: "TokenScope",
    skill: "Tokenomics Simulation",
    description: "Stress-tests emission curves, governance pressure, and reflexive feedback loops across 24-month horizons.",
    price: "$0.12",
    address: demoAddress(105),
    creatorAddress: demoAddress(105),
    systemPrompt: "You are a tokenomics simulator. Stress-test emission schedules, governance pressure, and reflexive loops. Produce a 24-month scenario analysis with TVL sensitivity, sell-pressure curves, and governance-capture risk.",
    reputation: { count: 57, averageScore: 4.8 },
    totalCalls: 247,
    type: "custom_skill",
  },
  {
    id: "liquidityMap",
    name: "LiquidityMap",
    skill: "AMM Depth Modeling",
    description: "Simulates concentrated liquidity and slippage across Uniswap V3, Curve, Balancer, and Maverick.",
    price: "$0.13",
    address: demoAddress(106),
    creatorAddress: demoAddress(106),
    systemPrompt: "You are an AMM depth analyst. Model concentrated liquidity positions, slippage curves, and impermanent loss across Uniswap V3, Curve, Balancer, and Maverick. Produce fill quality estimates for size-based orders.",
    reputation: { count: 81, averageScore: 4.7 },
    totalCalls: 493,
    type: "ai",
  },
  {
    id: "bridgeGuard",
    name: "BridgeGuard",
    skill: "Cross-Chain Bridge Audit",
    description: "Audits bridge message passing, validator sets, and proof systems across LayerZero, Wormhole, Axelar, and IBC.",
    price: "$0.24",
    address: demoAddress(107),
    creatorAddress: demoAddress(107),
    systemPrompt: "You are a cross-chain bridge auditor. Review message passing, validator sets, and proof systems across LayerZero, Wormhole, Axelar, and IBC. Identify trust assumptions, replay risks, and validator-collusion failure modes.",
    reputation: { count: 68, averageScore: 4.8 },
    totalCalls: 261,
    type: "custom_skill",
  },
  {
    id: "governanceLoop",
    name: "Governance Loop",
    skill: "Governance Research",
    description: "Synthesizes forum threads, delegate positions, and voting power flow into decision-ready governance briefs.",
    price: "$0.06",
    address: demoAddress(108),
    creatorAddress: demoAddress(108),
    systemPrompt: "You are a governance researcher. Summarize proposals, delegate positions, voting power concentration, and likely outcomes across Aragon, Snapshot, Tally, and governor-bravo systems.",
    reputation: { count: 146, averageScore: 4.8 },
    totalCalls: 921,
    type: "ai",
  },
  {
    id: "proofMesh",
    name: "ProofMesh",
    skill: "Release-Notes Verification",
    description: "Compares deployed bytecode, Etherscan verification, and release notes for claim-vs-reality drift.",
    price: "$0.13",
    address: demoAddress(109),
    creatorAddress: demoAddress(109),
    systemPrompt: "You are a release-notes verifier. Compare deployed bytecode, Etherscan verification, and release notes to identify feature claims that don't match the deployed implementation.",
    reputation: { count: 53, averageScore: 4.9 },
    totalCalls: 198,
    type: "custom_skill",
  },
  {
    id: "auditCanary",
    name: "Audit Canary",
    skill: "Pre-Audit Security Pass",
    description: "Fast-first security pass before engaging human auditors · surfaces obvious exploit classes in hours, not weeks.",
    price: "$0.14",
    address: demoAddress(110),
    creatorAddress: demoAddress(110),
    systemPrompt: "You are a pre-audit security pass. Identify obvious exploit classes (reentrancy, access control, oracle manipulation, signature replay) before handing off to a human audit firm.",
    reputation: { count: 79, averageScore: 4.9 },
    totalCalls: 307,
    type: "custom_skill",
  },
  {
    id: "riskLattice",
    name: "Risk Lattice",
    skill: "DeFi Treasury Risk",
    description: "Maps treasury vault exposure · vendor concentration, oracle dependency chains, and counterparty drift.",
    price: "$0.11",
    address: demoAddress(111),
    creatorAddress: demoAddress(111),
    systemPrompt: "You are a DeFi treasury risk analyst. Map vendor concentration, oracle dependency chains, correlated counterparty risk, and depeg cascade paths across a treasury vault stack.",
    reputation: { count: 66, averageScore: 4.7 },
    totalCalls: 328,
    type: "ai",
  },
  {
    id: "orbitCounsel",
    name: "Orbit Counsel",
    skill: "Cross-Border Treasury",
    description: "Reviews cross-border treasury flows for sanctions screening, MSB risk, and FATF travel-rule posture.",
    price: "$0.17",
    address: demoAddress(112),
    creatorAddress: demoAddress(112),
    systemPrompt: "You are a cross-border treasury analyst. Review flows for sanctions screening, MSB registration exposure, and FATF travel-rule posture. Produce action-ready compliance notes.",
    reputation: { count: 74, averageScore: 4.8 },
    totalCalls: 402,
    type: "ai",
  },
  {
    id: "vigilOps",
    name: "Vigil Ops",
    skill: "Protocol Incident Triage",
    description: "Correlates PagerDuty timelines with on-chain state to isolate root-cause candidates during live incidents.",
    price: "$0.15",
    address: demoAddress(113),
    creatorAddress: demoAddress(113),
    systemPrompt: "You are a protocol incident triage operator. Correlate PagerDuty timelines with on-chain events (liquidations, oracle updates, admin calls) to isolate root-cause candidates and produce a handoff memo.",
    reputation: { count: 84, averageScore: 4.7 },
    totalCalls: 476,
    type: "ai",
  },
  {
    id: "dataLatch",
    name: "DataLatch",
    skill: "DAO Data Extraction",
    description: "Pulls structured records from DAO treasury PDFs, multisig changelogs, and off-chain operations logs.",
    price: "$0.05",
    address: demoAddress(114),
    creatorAddress: demoAddress(114),
    systemPrompt: "You are a DAO data extraction agent. Parse DAO treasury PDFs, multisig changelogs, and operations logs into structured records with confidence notes and provenance.",
    reputation: { count: 129, averageScore: 4.6 },
    totalCalls: 1266,
    type: "ai",
  },
  {
    id: "evidenceDock",
    name: "Evidence Dock",
    skill: "Crypto Diligence Packets",
    description: "Packages on-chain, legal, and product evidence into investor-grade diligence packets for allocators.",
    price: "$0.16",
    address: demoAddress(115),
    creatorAddress: demoAddress(115),
    systemPrompt: "You are a crypto diligence assistant. Organize on-chain evidence, legal posture, product traction, and open questions into investor-grade diligence packets with confidence signals.",
    reputation: { count: 58, averageScore: 4.8 },
    totalCalls: 241,
    type: "custom_skill",
  },
  {
    id: "stableScope",
    name: "StableScope",
    skill: "Stablecoin Depeg Modeling",
    description: "Models depeg probability, redemption-path throughput, and reserve adequacy for fiat-backed and crypto-backed stables.",
    price: "$0.18",
    address: demoAddress(116),
    creatorAddress: demoAddress(116),
    systemPrompt: "You are a stablecoin analyst. Model depeg probability, redemption-path throughput, reserve adequacy (attestation or MPC), and historical stress correlation across USDC, USDT, DAI, FRAX, and LSD-backed stables.",
    reputation: { count: 91, averageScore: 4.8 },
    totalCalls: 518,
    type: "custom_skill",
  },

  // Specialized human experts · context, nuance, final sign-off
  {
    id: "counselNorth",
    name: "Counsel North",
    skill: "Crypto Securities Law (US)",
    description: "Former SEC trial attorney. Handles Howey/Reves classification edge cases and enforcement posture calls for live launches.",
    price: "$1.80/task",
    address: demoAddress(201),
    creatorAddress: demoAddress(201),
    systemPrompt: "",
    reputation: { count: 29, averageScore: 4.9 },
    totalCalls: 71,
    type: "human_expert",
  },
  {
    id: "prooflineExpert",
    name: "Proofline",
    skill: "Smart Contract Sign-Off",
    description: "Ex-Spearbit lead auditor. Final human sign-off on critical contracts after agent pre-pass · diff review + deployment evidence.",
    price: "$2.40/task",
    address: demoAddress(202),
    creatorAddress: demoAddress(202),
    systemPrompt: "",
    reputation: { count: 33, averageScore: 4.9 },
    totalCalls: 79,
    type: "human_expert",
  },
  {
    id: "ariaStone",
    name: "Aria Stone",
    skill: "Tokenomics Design",
    description: "Advised on 6+ L1/L2 token launches. Handles incentive-design edge cases and governance-capture intuition agents miss.",
    price: "$3.10/task",
    address: demoAddress(203),
    creatorAddress: demoAddress(203),
    systemPrompt: "",
    reputation: { count: 27, averageScore: 4.9 },
    totalCalls: 57,
    type: "human_expert",
  },
  {
    id: "reidMercer",
    name: "Reid Mercer",
    skill: "OFAC / Sanctions Review",
    description: "Former FinCEN advisor. Called when language choices in UI/docs could trigger sanctions or MSB posture risk.",
    price: "$2.20/task",
    address: demoAddress(204),
    creatorAddress: demoAddress(204),
    systemPrompt: "",
    reputation: { count: 24, averageScore: 4.8 },
    totalCalls: 53,
    type: "human_expert",
  },
  {
    id: "noraPike",
    name: "Nora Pike",
    skill: "Bridge Security Sign-Off",
    description: "Multi-chain bridge specialist. Validates validator-set changes and cross-chain message-passing upgrades live.",
    price: "$2.80/task",
    address: demoAddress(205),
    creatorAddress: demoAddress(205),
    systemPrompt: "",
    reputation: { count: 23, averageScore: 4.8 },
    totalCalls: 49,
    type: "human_expert",
  },
  {
    id: "mayaRios",
    name: "Maya Rios",
    skill: "Exploit Incident Response",
    description: "Led incident response on two 9-figure exploits. Called when a protocol is actively bleeding and agents aren't enough.",
    price: "$4.50/task",
    address: demoAddress(206),
    creatorAddress: demoAddress(206),
    systemPrompt: "",
    reputation: { count: 26, averageScore: 4.9 },
    totalCalls: 66,
    type: "human_expert",
  },
  {
    id: "julianKestrel",
    name: "Julian Kestrel",
    skill: "ZK Soundness Review",
    description: "Circuit-level soundness proofs. Final human review when an agent flags a constraint but can't prove exploitability.",
    price: "$3.40/task",
    address: demoAddress(207),
    creatorAddress: demoAddress(207),
    systemPrompt: "",
    reputation: { count: 21, averageScore: 4.8 },
    totalCalls: 46,
    type: "human_expert",
  },
  {
    id: "cadenRow",
    name: "Caden Row",
    skill: "DAO Governance Precedent",
    description: "Governance-forum historian. Pulled in when a proposal touches constitutional edges or historic precedent.",
    price: "$1.40/task",
    address: demoAddress(208),
    creatorAddress: demoAddress(208),
    systemPrompt: "",
    reputation: { count: 20, averageScore: 4.8 },
    totalCalls: 44,
    type: "human_expert",
  },
];
