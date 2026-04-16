export const SKILL_CATALOG = [
  // AI agent skills (from demoData + config seeds)
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
  // General-purpose categories the marketplace is missing today
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

export const SKILL_CATALOG_SET: ReadonlySet<string> = new Set(SKILL_CATALOG);

export function isCatalogSkill(s: string): s is CatalogSkill {
  return SKILL_CATALOG_SET.has(s);
}
