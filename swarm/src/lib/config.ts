// Next.js loads .env* files automatically in dev; Vercel injects env vars at runtime.
// No manual .env parsing needed here.

export const config = {
  // Avalanche Fuji
  rpc: process.env.AVALANCHE_FUJI_RPC || "https://api.avax-test.network/ext/bc/C/rpc",
  chainId: 43113,
  caip2: "eip155:43113",
  usdcContract: process.env.USDC_CONTRACT || "0x5425890298aed601595a70AB815c96711a31Bc65",

  // x402
  facilitatorUrl: process.env.FACILITATOR_URL || "https://facilitator.ultravioletadao.xyz",

  // ERC-8004
  identityRegistry: process.env.IDENTITY_REGISTRY || "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  reputationRegistry: process.env.REPUTATION_REGISTRY || "0x8004B663056A597Dffe9eCcC1965A193B7388713",

  // AI — Vertex AI (service-account-bound API key)
  googleApiKey: process.env.GOOGLE_API_KEY || "",
  gcpProjectId: process.env.GCP_PROJECT_ID || "",
  gcpLocation: process.env.GCP_LOCATION || "us-central1",

  // Agent wallets
  orchestrator: {
    privateKey: process.env.ORCHESTRATOR_PRIVATE_KEY || "",
    address: process.env.ORCHESTRATOR_ADDRESS || "",
  },
  agents: {
    linguaBot: {
      privateKey: process.env.LINGUABOT_PRIVATE_KEY || "",
      address: process.env.LINGUABOT_ADDRESS || "",
      name: "Chainsight",
      skill: "On-Chain Forensics",
      description:
        "Traces fund flows, clusters wallets, and produces evidence-grade on-chain forensics reports with mixer-aware heuristics.",
      price: "$0.14",
      systemPrompt:
        "You are an on-chain forensics analyst specializing in Ethereum, Avalanche, Solana, and zk-rollups. Given a wallet, transaction, or exploit, produce a structured forensics report: (1) timeline of movements with block numbers and amounts, (2) address clusters and labels using heuristics (mixer interactions, CEX deposits, bridge activity), (3) likely motive, (4) recoverable vs obfuscated funds estimate, (5) recommended next steps for law enforcement or the protocol team. Cite tx hashes and be evidence-grade.",
    },
    codeReviewer: {
      privateKey: process.env.CODE_REVIEWER_PRIVATE_KEY || "",
      address: process.env.CODE_REVIEWER_ADDRESS || "",
      name: "Solmantis",
      skill: "Solidity Exploit Detection",
      description:
        "Deep Solidity exploit detection — reentrancy windows, delegatecall traps, storage collisions, upgrade-path risks.",
      price: "$0.18",
      systemPrompt:
        "You are a Solidity exploit researcher with a deep background in reentrancy patterns, delegatecall and proxy storage collisions, selfdestruct traps, signature replay, and cross-chain bridge failure modes. Review the given Solidity for realistic exploit paths only — no style or preference nits. For each finding: (1) exploit classification, (2) severity (critical/high/medium), (3) PoC sketch or attack sequence, (4) concrete patch. Skip findings you cannot justify with a reproducible path.",
    },
    summarizer: {
      privateKey: process.env.SUMMARIZER_PRIVATE_KEY || "",
      address: process.env.SUMMARIZER_ADDRESS || "",
      name: "MEV Scope",
      skill: "MEV & Orderflow Analysis",
      description:
        "Decodes MEV attacks, sandwiches, JIT liquidity, and private-mempool flow — builder-aware, cross-chain.",
      price: "$0.09",
      systemPrompt:
        "You are an MEV analyst specializing in Ethereum, Base, Arbitrum, and BNB chain orderflow. Given a block range, tx hash, or pool, identify: (1) sandwich attacks (front/victim/back txs, profit in ETH/USD), (2) JIT liquidity events, (3) back-runs and atomic arbitrage, (4) builder-level routing behavior and private-mempool usage. Be precise about gas costs vs extraction. If insufficient data, state what you need.",
    },
    solidityAuditor: {
      privateKey: process.env.SOLIDITY_AUDITOR_PRIVATE_KEY || "",
      address: process.env.SOLIDITY_AUDITOR_ADDRESS || "",
      name: "RegulaNet",
      skill: "Regulatory & MiCA Compliance",
      description:
        "Jurisdiction-aware regulatory analysis for token launches, stablecoins, and DeFi frontends — MiCA, SEC, and FATF framing.",
      price: "$0.22",
      systemPrompt:
        "You are a crypto regulatory analyst with depth in MiCA (EU), SEC enforcement precedent (Howey, Reves), FATF travel-rule, MSB registration, and state-by-state money transmission posture. Given a product description or token design, produce: (1) classification risk by major jurisdiction, (2) disclosure and registration obligations, (3) recent enforcement actions that match the pattern, (4) concrete mitigations a small legal team can ship in 30 days. Be conservative and cite specific rules.",
    },
  },

  // Human expert
  humanExpert: {
    privateKey: process.env.HUMAN_EXPERT_PRIVATE_KEY || "",
    address: process.env.HUMAN_EXPERT_ADDRESS || "",
  },
};
