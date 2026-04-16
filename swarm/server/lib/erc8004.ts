import { ethers } from "ethers";
import { config } from "./config";
import IdentityRegistryABI from "../abis/IdentityRegistry.json";
import ReputationRegistryABI from "../abis/ReputationRegistry.json";

const provider = new ethers.JsonRpcProvider(config.rpc);

function getIdentityRegistry(signer: ethers.Wallet) {
  return new ethers.Contract(config.identityRegistry, IdentityRegistryABI, signer);
}

function getReputationRegistry(signer: ethers.Wallet) {
  return new ethers.Contract(config.reputationRegistry, ReputationRegistryABI, signer);
}

function getSigner(privateKey: string): ethers.Wallet {
  return new ethers.Wallet(privateKey, provider);
}

// Register an agent and return its agentId
export async function registerAgent(
  ownerPrivateKey: string,
  agentURI: string
): Promise<bigint> {
  const signer = getSigner(ownerPrivateKey);
  const registry = getIdentityRegistry(signer);

  const tx = await registry["register(string)"](agentURI);
  const receipt = await tx.wait();

  // Extract agentId from Registered event
  for (const log of receipt.logs) {
    try {
      const parsed = registry.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === "Registered") {
        return parsed.args.agentId;
      }
    } catch {
      // skip non-matching logs
    }
  }
  throw new Error("Failed to extract agentId from registration transaction");
}

// Give feedback (reputation) for an agent
export async function giveFeedback(
  callerPrivateKey: string,
  agentId: bigint,
  score: number, // 1-5
  skillTag: string,
  endpoint: string
): Promise<void> {
  const signer = getSigner(callerPrivateKey);
  const registry = getReputationRegistry(signer);

  // Use 1 decimal: score 4.0 = value 40, decimals 1
  const value = BigInt(score * 10);
  const decimals = 1;

  const tx = await registry.giveFeedback(
    agentId,
    value,
    decimals,
    skillTag,       // tag1: skill category
    "quality",      // tag2: feedback type
    endpoint,
    "",             // feedbackURI (optional)
    ethers.ZeroHash // feedbackHash (optional)
  );
  await tx.wait();
}

// Read aggregate reputation for an agent
export async function getReputation(agentId: bigint): Promise<{
  count: number;
  averageScore: number;
}> {
  const signer = getSigner(config.orchestrator.privateKey);
  const registry = getReputationRegistry(signer);

  try {
    const clients = await registry.getClients(agentId);
    if (clients.length === 0) {
      return { count: 0, averageScore: 0 };
    }

    const [count, summaryValue, summaryDecimals] = await registry.getSummary(
      agentId,
      clients,
      "", // all tag1
      ""  // all tag2
    );

    const divisor = 10 ** Number(summaryDecimals);
    const totalScore = Number(summaryValue) / divisor;
    const avgScore = Number(count) > 0 ? totalScore / Number(count) : 0;

    return {
      count: Number(count),
      averageScore: Math.round(avgScore * 10) / 10, // 1 decimal place
    };
  } catch {
    return { count: 0, averageScore: 0 };
  }
}

// Read agent identity info
export async function getAgentInfo(agentId: bigint): Promise<{
  owner: string;
  uri: string;
}> {
  const signer = getSigner(config.orchestrator.privateKey);
  const registry = getIdentityRegistry(signer);

  const owner = await registry.ownerOf(agentId);
  const uri = await registry.tokenURI(agentId);

  return { owner, uri };
}
