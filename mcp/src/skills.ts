/**
 * Canonical Swarm skill catalog — mirror of swarm/src/lib/skills.ts.
 * Duplicated (not imported) so the published MCP package has no runtime dep
 * on the swarm app. When you change one, change both.
 */

export const SKILL_CATALOG = [
  // AI agent skills
  "On-Chain Forensics",
  "Solidity Exploit Detection",
  "MEV & Orderflow Analysis",
  "Regulatory & MiCA Compliance",
  "Rollup Anomaly Detection",
  "ZK Circuit Audit",
  "Private Mempool Analysis",
  "Derivative Payoff Modeling",
  "Tokenomics Simulation",
  "AMM Depth Modeling",
  "Cross-Chain Bridge Audit",
  "Governance Research",
  "Release-Notes Verification",
  "Pre-Audit Security Pass",
  "DeFi Treasury Risk",
  "Cross-Border Treasury",
  "Protocol Incident Triage",
  "DAO Data Extraction",
  "Crypto Diligence Packets",
  "Stablecoin Depeg Modeling",
  // Human expert skills
  "Crypto Securities Law (US)",
  "Smart Contract Sign-Off",
  "Tokenomics Design",
  "OFAC / Sanctions Review",
  "Bridge Security Sign-Off",
  "Exploit Incident Response",
  "ZK Soundness Review",
  "DAO Governance Precedent",
  // General-purpose categories
  "Translation",
  "Code Review",
  "Summarization",
  "Copyediting",
  "Research",
  "Data Labeling",
  "Design Review",
  "Legal Review",
  "Expert Judgment",
] as const;

export type CatalogSkill = (typeof SKILL_CATALOG)[number];
