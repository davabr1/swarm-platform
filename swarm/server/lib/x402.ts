import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { config } from "./config";
import type { Request, Response, NextFunction, RequestHandler } from "express";

const NETWORK = "eip155:43113"; // Avalanche Fuji CAIP-2

/**
 * Build the x402 middleware for a given set of routes.
 * Each route specifies price + the wallet address that receives payment.
 */
export function createX402Middleware(
  routes: Record<string, { price: string; payTo: string; description?: string }>
): RequestHandler {
  const facilitatorClient = new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
  });

  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    NETWORK,
    new ExactEvmScheme()
  );

  // Transform our simple route config into the full x402 RoutesConfig shape
  const routesConfig: Parameters<typeof paymentMiddleware>[0] = {};
  for (const [route, cfg] of Object.entries(routes)) {
    routesConfig[route] = {
      accepts: {
        scheme: "exact" as const,
        price: cfg.price,
        network: NETWORK,
        payTo: cfg.payTo,
      },
      description: cfg.description || "Agent service",
      mimeType: "application/json",
    };
  }

  return paymentMiddleware(routesConfig, resourceServer);
}

/**
 * A soft middleware that logs an intended x402 payment but doesn't actually
 * enforce it. Used in "demo mode" when the orchestrator wallet isn't funded
 * with testnet tokens yet. Toggled by the X402_ENFORCE env var.
 */
export function simulatedX402Middleware(
  routes: Record<string, { price: string; payTo: string; description?: string }>
): RequestHandler {
  type RequestWithX402 = Request & {
    x402Payment?: {
      price: string;
      payTo: string;
      simulated: boolean;
    };
  };

  return (req: Request, res: Response, next: NextFunction) => {
    const routeKey = `${req.method} ${req.path}`;
    const route = routes[routeKey];
    if (route) {
      // Attach payment metadata to the request so downstream handlers can log it
      (req as RequestWithX402).x402Payment = {
        price: route.price,
        payTo: route.payTo,
        simulated: true,
      };
    }
    next();
  };
}

/**
 * Returns whichever middleware is appropriate based on environment.
 * Real x402 requires the orchestrator wallet to have testnet USDC.
 */
export function x402Middleware(
  routes: Record<string, { price: string; payTo: string; description?: string }>
): RequestHandler {
  const enforceReal = process.env.X402_ENFORCE === "true";
  if (enforceReal) {
    console.log("🔐 Using REAL x402 payment enforcement");
    return createX402Middleware(routes);
  }
  console.log("⚡ Using simulated x402 payments (set X402_ENFORCE=true to enforce)");
  return simulatedX402Middleware(routes);
}
