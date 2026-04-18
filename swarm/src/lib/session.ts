import "server-only";

// Under x402, paid routes authenticate via the EIP-3009 signature inside
// `X-PAYMENT`. Free routes (list, rate, cancel, ...) don't have that — they
// read the caller's wallet address from the `X-Asker-Address` header written
// by both the MCP CLI and the browser client.
//
// This is not authenticated. An attacker can forge any address for free-route
// calls. We accept that: the only mutations gated by this header are task
// cancel + rating, and both are bounded by the task's recorded `postedBy` /
// `claimedBy` — the worst case is a griefer cancelling someone else's task
// and forcing a refund, which hurts nobody economically.

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export function resolveAgentAddress(req: Request): string | null {
  const raw = req.headers.get("x-asker-address");
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!ADDR_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}
