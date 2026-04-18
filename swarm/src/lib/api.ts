export type PricingModel = "flat" | "tiered" | "per_token" | "per_minute";

export interface Agent {
  id: string;
  name: string;
  skill: string;
  description: string;
  price: string;
  address: string;
  creatorAddress?: string;
  type: "ai" | "custom_skill" | "human_expert";
  // true = created by an independent wallet via /api/agents/create.
  // false = platform-seeded (charges no commission; platform keeps the 5%
  // margin instead). Marketplace "custom" filter uses this, not `type`.
  userCreated: boolean;
  reputation: { count: number; averageScore: number };
  totalCalls: number;
  agentId?: string;
  pricingModel?: PricingModel;
  pricingNote?: string;
}

export interface Task {
  id: string;
  description: string;
  bounty: string;
  skill: string;
  payload?: string;
  hasPayload: boolean;
  status: "open" | "claimed" | "completed" | "cancelled";
  postedBy: string;
  claimedBy?: string;
  result?: string;
  hasResult?: boolean;
  assignedTo?: string;
  requiredSkill?: string;
  minReputation?: number;
  visibility: "public" | "private";
  posterRating?: number;
  posterRatedAt?: number;
  payoutTxHash?: string;
  payoutBlockNumber?: number;
  cancelledAt?: number;
  createdAt: number;
  claimedAt?: number;
  completedAt?: number;
}

export interface UserProfile {
  walletAddress: string;
  displayName?: string;
  bio?: string;
  email?: string;
  balanceMicroUsd: string;
  autonomousCapUsd?: string;
  autonomousCapMicroUsd: string;
  autonomousSpentMicroUsd: string;
  autoTopup: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ProfilePortfolio {
  profile: UserProfile;
  agents: Agent[];
  postedTasks: Task[];
  claimedTasks: Task[];
  inbox: Task[];
}

export interface ActivityItem {
  type: "payment" | "reputation" | "task" | "registration";
  message: string;
  timestamp: number;
}

export interface GuidanceBreakdown {
  commissionUsd: string;
  geminiCostUsd: string;
  platformFeeUsd: string;
  totalUsd: string;
}

export interface GuidanceTokens {
  prompt: number;
  output: number;
  thoughts: number;
}

export interface GuidanceRequest {
  id: string;
  agentId?: string;
  askerAddress?: string;
  status: "pending" | "ready" | "failed";
  response: string | null;
  errorMessage?: string | null;
  breakdown: GuidanceBreakdown | null;
  tokens?: GuidanceTokens | null;
  agent?: { id: string; name: string; creatorAddress: string };
  createdAt?: string;
  readyAt?: string | null;
  // Follow-up envelope (matches MCP `swarm_ask_agent` / `swarm_follow_up`).
  // `replyType === "question"` means the specialist asked a clarifying
  // question — the UI should let the user reply with the same
  // conversationId instead of firing the rating gate.
  replyType?: "question" | "response";
  conversationId?: string;
  turn?: number;
  capped?: boolean;
}

export async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch(`/api/agents`);
  return res.json();
}

export async function fetchAgent(id: string): Promise<Agent> {
  const res = await fetch(`/api/agents/${id}`);
  return res.json();
}

// Payment-gated call errors that the UI may want to act on (re-open pair
// modal, link to top-up, etc). The error message on `error.cause` carries
// the raw `error` field from the backend response body.
export class PaymentRequiredError extends Error {
  readonly status: number;
  readonly reason: string;
  readonly detail: Record<string, unknown> | undefined;
  constructor(status: number, reason: string, detail?: Record<string, unknown>) {
    super(`Payment required: ${reason}`);
    this.name = "PaymentRequiredError";
    this.status = status;
    this.reason = reason;
    this.detail = detail;
  }
}

function jsonHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

async function throwIfPaymentRequired(res: Response): Promise<Response> {
  if (res.status === 401 || res.status === 402) {
    const body = await res.json().catch(() => ({}));
    throw new PaymentRequiredError(
      res.status,
      typeof body?.error === "string" ? body.error : `http_${res.status}`,
      body && typeof body === "object" ? (body as Record<string, unknown>) : undefined,
    );
  }
  return res;
}

export async function askAgent(
  agentId: string,
  question: string,
  opts?: { askerAddress?: string; conversationId?: string },
): Promise<GuidanceRequest> {
  const res = await fetch(`/api/guidance`, {
    method: "POST",
    headers: jsonHeaders(),
    credentials: "same-origin",
    body: JSON.stringify({
      agentId,
      question,
      askerAddress: opts?.askerAddress,
      // When set, the route loads the prior chain and bills this as a
      // follow-up turn (same envelope shape, up to the 5-turn cap).
      conversationId: opts?.conversationId,
    }),
  });
  await throwIfPaymentRequired(res);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "guidance request failed");
  }
  return data;
}

export interface ImageResult {
  id: string;
  status: string;
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
  sizeBytes?: number;
  model?: string;
  breakdown?: {
    commissionUsd: string;
    geminiCostUsd: string;
    platformFeeUsd: string;
    totalUsd: string;
  };
  settlement?: { status: string; txHash: string; blockNumber: number };
  error?: string;
}

export async function callImage(
  agentId: string,
  prompt: string,
): Promise<ImageResult> {
  const res = await fetch(`/api/image`, {
    method: "POST",
    headers: jsonHeaders(),
    credentials: "same-origin",
    body: JSON.stringify({ agentId, prompt }),
  });
  await throwIfPaymentRequired(res);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "image request failed");
  }
  return data;
}

export async function fetchGuidance(id: string): Promise<GuidanceRequest> {
  const res = await fetch(`/api/guidance/${id}`);
  if (!res.ok) {
    const p = await res.json().catch(() => ({}));
    throw new Error(p.error || "failed to fetch guidance");
  }
  return res.json();
}

export async function rateAgent(id: string, score: number): Promise<{ success: boolean; reputation: { count: number; averageScore: number } }> {
  const res = await fetch(`/api/agents/${id}/rate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score }),
  });
  return res.json();
}

export async function fetchTasks(viewer?: string): Promise<Task[]> {
  const qs = viewer ? `?viewer=${encodeURIComponent(viewer)}` : "";
  const res = await fetch(`/api/tasks${qs}`);
  return res.json();
}

export async function fetchInbox(viewer: string): Promise<Task[]> {
  const res = await fetch(`/api/tasks?viewer=${encodeURIComponent(viewer)}&inbox=1`);
  return res.json();
}

export async function postTask(data: {
  description: string;
  bounty: string;
  skill: string;
  postedBy: string;
  payload?: string;
  assignedTo?: string;
  requiredSkill?: string;
  minReputation?: number;
  visibility?: "public" | "private";
}): Promise<Task> {
  const res = await fetch(`/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const p = await res.json().catch(() => ({}));
    throw new Error(p.error || "failed to post task");
  }
  return res.json();
}

export async function claimTask(id: string, expertAddress?: string): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expertAddress }),
  });
  if (!res.ok) {
    const p = await res.json().catch(() => ({}));
    throw new Error(p.error || "failed to claim task");
  }
  return res.json();
}

export async function submitTask(id: string, result: string): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ result }),
  });
  if (!res.ok) {
    const p = await res.json().catch(() => ({}));
    throw new Error(p.message || p.error || "failed to submit task");
  }
  return res.json();
}

export async function cancelTask(id: string): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}/cancel`, { method: "POST" });
  if (!res.ok) {
    const p = await res.json().catch(() => ({}));
    throw new Error(p.message || p.error || "failed to cancel task");
  }
  return res.json();
}

export async function updateTaskVisibility(
  id: string,
  viewer: string,
  visibility: "public" | "private",
): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}?viewer=${encodeURIComponent(viewer)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visibility }),
  });
  if (!res.ok) {
    const p = await res.json().catch(() => ({}));
    throw new Error(p.error || "failed to update visibility");
  }
  return res.json();
}

export async function rateTask(
  id: string,
  viewer: string,
  score: number,
): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}/rate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ viewer, score }),
  });
  if (!res.ok) {
    const p = await res.json().catch(() => ({}));
    throw new Error(p.error || "failed to rate task");
  }
  return res.json();
}

export async function fetchProfile(address: string, viewer?: string): Promise<ProfilePortfolio> {
  const qs = viewer ? `?viewer=${encodeURIComponent(viewer)}` : "";
  const res = await fetch(`/api/profile/${address}${qs}`);
  if (!res.ok) {
    const p = await res.json().catch(() => ({}));
    throw new Error(p.error || "failed to load profile");
  }
  return res.json();
}

export async function updateProfile(
  address: string,
  viewer: string,
  data: Partial<{
    displayName: string;
    bio: string;
    email: string;
    autoTopup: boolean;
  }>,
): Promise<UserProfile> {
  const res = await fetch(`/api/profile/${address}?viewer=${encodeURIComponent(viewer)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const p = await res.json().catch(() => ({}));
    throw new Error(p.error || "failed to update profile");
  }
  return res.json();
}

export async function createCustomAgent(data: {
  name: string;
  skill: string;
  description: string;
  price: string;
  systemPrompt: string;
  creatorAddress: string;
  useSwarmWrapper?: boolean;
}): Promise<Agent> {
  const res = await fetch(`/api/agents/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function applyAsExpert(data: {
  name: string;
  skill: string;
  description: string;
  rate: string;
  walletAddress: string;
}): Promise<Agent> {
  const res = await fetch(`/api/experts/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || "Failed to apply as expert");
  }

  return res.json();
}

export async function fetchActivity(): Promise<ActivityItem[]> {
  const res = await fetch(`/api/activity`);
  return res.json();
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpStatus {
  status: "ready" | "down";
  version: string;
  tools: string[];
  toolDefs: McpToolDef[];
  transports: string[];
  apiBase: string;
}

export async function getMcpStatus(): Promise<McpStatus> {
  const res = await fetch(`/api/mcp/status`, { cache: "no-store" });
  if (!res.ok) throw new Error("mcp down");
  return res.json();
}

export async function pingMcp(): Promise<{ ok: boolean; latencyMs: number; agentCount: number }> {
  const res = await fetch(`/api/mcp/ping`, { method: "POST" });
  if (!res.ok) throw new Error("ping failed");
  return res.json();
}

export interface Balance {
  address: string;
  balanceMicroUsd: string;
  balanceUsd: string;
  autonomousCapMicroUsd: string;
  autonomousCapUsd: string;
  autonomousSpentMicroUsd: string;
  autonomousSpentUsd: string;
  autonomousRemainingUsd: string;
  usingDefaultCap: boolean;
}

export async function fetchBalance(address: string): Promise<Balance> {
  const res = await fetch(`/api/balance?address=${encodeURIComponent(address)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("failed to load balance");
  return res.json();
}

export async function setAutonomousCap(params: {
  address: string;
  autonomousCapUsd: number;
  issuedAt: number;
  signature: string;
}): Promise<{ success: boolean; autonomousCapUsd: string }> {
  const res = await fetch(`/api/balance/cap`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const p = await res.json().catch(() => ({}));
    throw new Error(p.error || "failed to set cap");
  }
  return res.json();
}

export async function resetAutonomousCap(params: {
  address: string;
  issuedAt: number;
  signature: string;
}): Promise<{ success: boolean }> {
  const res = await fetch(`/api/balance/cap/reset`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const p = await res.json().catch(() => ({}));
    throw new Error(p.error || "failed to reset cap");
  }
  return res.json();
}

export interface TransactionEntry {
  id: string;
  kind: "deposit" | "autonomous_spend" | "manual_spend" | "earning" | "refund";
  deltaMicroUsd: string;
  grossMicroUsd: string;
  usd: string;
  description: string | null;
  refType: string | null;
  refId: string | null;
  agentName: string | null;
  txHash: string | null;
  blockNumber: number | null;
  status: string;
  createdAt: number;
}

export async function fetchTransactions(
  address: string,
  opts?: { kind?: string; limit?: number; cursor?: string | null },
): Promise<{ entries: TransactionEntry[]; nextCursor: string | null; hasMore: boolean }> {
  const qs = new URLSearchParams();
  if (opts?.kind && opts.kind !== "all") qs.set("kind", opts.kind);
  if (opts?.limit) qs.set("limit", String(opts.limit));
  if (opts?.cursor) qs.set("cursor", opts.cursor);
  const url = `/api/profile/${address}/transactions${qs.toString() ? `?${qs}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("failed to load transactions");
  return res.json();
}

export interface DepositConfig {
  treasury: string;
  usdc: string;
  chainId: number;
}

export async function fetchDepositConfig(): Promise<DepositConfig> {
  const res = await fetch(`/api/deposit/config`);
  if (!res.ok) throw new Error("failed to load deposit config");
  return res.json();
}

export async function announceDeposit(params: {
  address: string;
  txHash: string;
}): Promise<{ status: string; creditedMicroUsd?: string }> {
  const res = await fetch(`/api/deposit/announce`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const p = await res.json().catch(() => ({}));
    throw new Error(p.error || "announce failed");
  }
  return res.json();
}

export async function pollDeposits(address: string): Promise<{ creditedMicroUsd: string }> {
  const res = await fetch(`/api/deposit/poll`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ address }),
  });
  if (!res.ok) {
    const p = await res.json().catch(() => ({}));
    throw new Error(p.error || "poll failed");
  }
  return res.json();
}

export async function mintManualSession(params: {
  address: string;
  issuedAt: number;
  signature: string;
}): Promise<{ success: boolean; address: string; expiresAt: number }> {
  const res = await fetch(`/api/manual-session`, {
    method: "POST",
    headers: jsonHeaders(),
    credentials: "same-origin",
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const p = await res.json().catch(() => ({}));
    throw new Error(p.error || "manual session mint failed");
  }
  return res.json();
}

export async function clearManualSession(): Promise<void> {
  await fetch(`/api/manual-session`, { method: "DELETE", credentials: "same-origin" });
}
