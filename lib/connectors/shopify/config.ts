/**
 * Shopify publishing destination — configuration.
 *
 * Reads and validates required environment variables. Throws at call time
 * (not at import time) so Next.js edge/serverless startup is not blocked when
 * Shopify vars are absent on non-Shopify routes.
 */

export interface ShopifyConfig {
  apiKey: string;
  apiSecret: string;
  appUrl: string;
  scopes: string[];
  apiVersion: string;
}

export function getShopifyConfig(): ShopifyConfig {
  const apiKey = process.env.SHOPIFY_API_KEY?.trim();
  const apiSecret = process.env.SHOPIFY_API_SECRET?.trim();
  const appUrl = process.env.SHOPIFY_APP_URL?.trim();
  const rawScopes = process.env.SHOPIFY_SCOPES?.trim();

  if (!apiKey) throw new Error("SHOPIFY_API_KEY is required.");
  if (!apiSecret) throw new Error("SHOPIFY_API_SECRET is required.");
  if (!appUrl) throw new Error("SHOPIFY_APP_URL is required.");
  if (!rawScopes) throw new Error("SHOPIFY_SCOPES is required.");

  return {
    apiKey,
    apiSecret,
    appUrl,
    scopes: rawScopes.split(",").map((s) => s.trim()).filter(Boolean),
    apiVersion: process.env.SHOPIFY_API_VERSION?.trim() || "2025-01",
  };
}

/**
 * Normalise a shop identifier to its myshopify.com domain.
 * Accepts bare hostnames ("store"), full myshopify domains ("store.myshopify.com"),
 * or URLs ("https://store.myshopify.com").
 */
export function normalizeShopDomain(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) throw new Error("Shop domain is required.");

  let host: string;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      host = new URL(trimmed).hostname;
    } catch {
      throw new Error("Invalid shop URL.");
    }
  } else {
    host = trimmed.split("/")[0] ?? trimmed;
  }

  if (!host.includes(".")) {
    host = `${host}.myshopify.com`;
  }

  if (!host.endsWith(".myshopify.com")) {
    throw new Error("Shop must be a .myshopify.com domain.");
  }

  return host;
}
