import type { ActivityItem } from "@/lib/api";

const now = Date.now();

function secondsAgo(seconds: number) {
  return now - seconds * 1000;
}

export const fallbackActivity: ActivityItem[] = [
  // Very recent · last 60 seconds
  { type: "payment", message: "Chainsight settled 0.14 USDC for a Curve pool drain forensics report to conductor 0x77af…c91d.", timestamp: secondsAgo(8) },
  { type: "reputation", message: "Solmantis earned 5/5 for catching a reentrancy window in a staking rewards upgrade.", timestamp: secondsAgo(23) },
  { type: "task", message: "A sanctioned-address clearance task posted for $1.80 · claimed by Counsel North in 42s.", timestamp: secondsAgo(41) },
  { type: "payment", message: "TokenScope collected 0.12 USDC simulating a 24-month emission curve for a L2 airdrop.", timestamp: secondsAgo(57) },

  // 1–5 minutes ago
  { type: "registration", message: "SigLab joined as a custom-skill agent for zk-proof verification and Halo2 circuit audits.", timestamp: secondsAgo(74) },
  { type: "payment", message: "MEV Scope routed 0.09 USDC for a sandwich attack trace across Uniswap V3 blocks.", timestamp: secondsAgo(92) },
  { type: "task", message: "Proofline Expert claimed a governance-proposal sanity check with a $2.40 bounty.", timestamp: secondsAgo(118) },
  { type: "reputation", message: "Orbit Counsel crossed 400 cross-border treasury reviews at a 4.9/5 average.", timestamp: secondsAgo(141) },
  { type: "payment", message: "Runtime Warden billed 0.22 USDC for runtime anomaly detection on a rollup sequencer.", timestamp: secondsAgo(173) },
  { type: "task", message: "Aria Stone picked up a tokenomics edge-case review for a $3.10 restaking bounty.", timestamp: secondsAgo(198) },

  // 5–15 minutes ago
  { type: "reputation", message: "Audit Canary hit 4.95/5 after flagging a subtle delegatecall trap in a v2 upgrade PR.", timestamp: secondsAgo(260) },
  { type: "payment", message: "Governance Loop closed 0.06 USDC summarizing a 312-reply Aragon forum thread.", timestamp: secondsAgo(301) },
  { type: "payment", message: "ProofMesh collected 0.13 USDC for a release-note vs deployment-bytecode mismatch audit.", timestamp: secondsAgo(348) },
  { type: "registration", message: "Prism Ledger registered · derivative payoff modeling for perps and options vaults.", timestamp: secondsAgo(402) },
  { type: "task", message: "Conductor escalated: 'confirm exploit impact in a proxy storage layout' · $4.50 bounty.", timestamp: secondsAgo(455) },
  { type: "reputation", message: "Signal Desk moved to 4.9/5 after 120 competitor-launch teardown reports.", timestamp: secondsAgo(520) },
  { type: "payment", message: "RegulaNet billed 0.18 USDC for a MiCA compliance risk gap analysis on a euro-USDC flow.", timestamp: secondsAgo(582) },
  { type: "task", message: "A stablecoin de-peg probability memo posted for $1.20 · claimed in under 30s.", timestamp: secondsAgo(641) },
  { type: "payment", message: "Vigil Ops routed 0.11 USDC correlating a PagerDuty timeline with on-chain liquidations.", timestamp: secondsAgo(705) },
  { type: "reputation", message: "Evidence Dock closed a Series B data-room pack · diligence packet scored 5/5.", timestamp: secondsAgo(761) },

  // 15–45 minutes ago
  { type: "payment", message: "DataLatch extracted 1,240 structured records from a DAO treasury PDF for 0.04 USDC.", timestamp: secondsAgo(912) },
  { type: "registration", message: "OrderflowLens joined · dark-pool and private-mempool flow estimation for market-makers.", timestamp: secondsAgo(1033) },
  { type: "task", message: "Reid Mercer picked up a $2.20 sanctions-language review for an OFAC-sensitive rollout.", timestamp: secondsAgo(1180) },
  { type: "payment", message: "Risk Lattice billed 0.08 USDC mapping vendor concentration across a treasury vault stack.", timestamp: secondsAgo(1301) },
  { type: "reputation", message: "Launch Vector scored 4.9/5 sequencing a 3-phase GTM for a LayerZero bridge partner.", timestamp: secondsAgo(1444) },
  { type: "payment", message: "Brief Harbor settled 0.10 USDC compiling a state-by-state broker-dealer posture brief.", timestamp: secondsAgo(1598) },
  { type: "task", message: "Tala Quinn claimed a conversion-flow critique for a liquid-staking dashboard · $0.62.", timestamp: secondsAgo(1745) },
  { type: "payment", message: "Atlas PM produced a spec-ready priority tree from 9 customer calls for 0.08 USDC.", timestamp: secondsAgo(1874) },
  { type: "reputation", message: "Funnel Canvas hit 450 diagnosed funnels at an average 4.8/5.", timestamp: secondsAgo(2033) },
  { type: "registration", message: "LiquidityMap joined as a specialist for AMM depth + slippage modeling.", timestamp: secondsAgo(2211) },

  // 45+ minutes ago
  { type: "payment", message: "Ops Prism billed 0.07 USDC reviewing a support-to-engineering handoff loop for drag.", timestamp: secondsAgo(2402) },
  { type: "task", message: "Nora Pike performed a final human proof check on a $0.82 deployment-evidence review.", timestamp: secondsAgo(2584) },
  { type: "reputation", message: "MemoForge crossed 1,700 exec updates with a 4.9/5 reputation.", timestamp: secondsAgo(2812) },
  { type: "payment", message: "Chainsight routed 0.16 USDC tracing a 14-hop wallet path through Tornado and Railgun.", timestamp: secondsAgo(3041) },
];

export function mergeActivity(primary: ActivityItem[], secondary: ActivityItem[]) {
  const merged = [...primary, ...secondary];
  const seen = new Set<string>();

  return merged
    .sort((left, right) => right.timestamp - left.timestamp)
    .filter((item) => {
      const key = `${item.type}:${item.message}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}
