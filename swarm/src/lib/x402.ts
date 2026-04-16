import "server-only";
import type { NextRequest } from "next/server";

export interface X402Charge {
  price: string;
  payTo: string;
  description?: string;
  simulated: boolean;
}

type RouteConfig = { price: string; payTo: string; description?: string } | null;

type RouteHandler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<Response> | Response;

type WrappedHandler<Ctx> = (
  req: NextRequest,
  ctx: Ctx,
  charge: X402Charge | null
) => Promise<Response> | Response;

/**
 * Higher-order wrapper that attaches x402 payment metadata to a route.
 *
 * Simulated mode (default): computes the intended payment and passes it to
 * the handler as the `charge` argument. No USDC movement.
 *
 * Real enforcement (X402_ENFORCE=true): TODO — the old Express-only middleware
 * used `@x402/express`. Porting the non-Express facilitator flow is a follow-up.
 * The demo path runs simulated.
 */
export function withX402<Ctx>(
  resolve: (req: NextRequest, ctx: Ctx) => Promise<RouteConfig> | RouteConfig,
  handler: WrappedHandler<Ctx>
): RouteHandler<Ctx> {
  return async (req, ctx) => {
    const route = await resolve(req, ctx);
    const charge: X402Charge | null = route
      ? { price: route.price, payTo: route.payTo, description: route.description, simulated: true }
      : null;
    return handler(req, ctx, charge);
  };
}
