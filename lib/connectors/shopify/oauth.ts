/**
 * Shopify publishing destination — OAuth helpers.
 *
 * Builds the authorize URL, verifies the callback HMAC, and exchanges
 * the code for an offline access token.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { ShopifyConfig } from "./config";

export interface TokenExchangeResult {
  accessToken: string;
  scope: string;
}

/**
 * Build the Shopify OAuth authorization URL that the merchant is redirected to.
 */
export function buildAuthorizeUrl(shop: string, state: string, config: ShopifyConfig): string {
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", config.apiKey);
  url.searchParams.set("scope", config.scopes.join(","));
  url.searchParams.set("redirect_uri", oauthCallbackUrl(config));
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * The registered redirect URI — must match what is set in the Partner dashboard
 * and shopify.app.toml.
 */
export function oauthCallbackUrl(config: ShopifyConfig): string {
  const base = (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? config.appUrl).replace(/\/$/, "");
  return `${base}/api/project/shopify/callback`;
}

/**
 * Verify the HMAC Shopify sends on the callback before trusting any other params.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * https://shopify.dev/docs/apps/build/authentication-authorization/get-access-tokens/authorization-code-grant/implement-oauth#verify-a-request
 */
export function verifyCallbackHmac(params: URLSearchParams, apiSecret: string): boolean {
  const hmac = params.get("hmac");
  if (!hmac) return false;

  const message = [...params.entries()]
    .filter(([key]) => key !== "hmac")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const digest = createHmac("sha256", apiSecret).update(message).digest("hex");

  const digestBuf = Buffer.from(digest);
  const hmacBuf = Buffer.from(hmac);

  if (digestBuf.length !== hmacBuf.length) return false;
  return timingSafeEqual(digestBuf, hmacBuf);
}

/**
 * Exchange the OAuth authorization code for an offline access token.
 */
export async function exchangeCodeForToken(
  shop: string,
  code: string,
  config: ShopifyConfig
): Promise<TokenExchangeResult> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: config.apiKey,
      client_secret: config.apiSecret,
      code,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Shopify token exchange failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { access_token?: string; scope?: string };
  if (!data.access_token) throw new Error("Shopify did not return an access token.");

  return {
    accessToken: data.access_token,
    scope: data.scope ?? "",
  };
}

/**
 * Verify the HMAC on an incoming Shopify webhook.
 * The raw request body must be passed as a string/Buffer.
 */
export function verifyWebhookHmac(rawBody: string, hmacHeader: string, apiSecret: string): boolean {
  const digest = createHmac("sha256", apiSecret).update(rawBody, "utf8").digest("base64");
  const digestBuf = Buffer.from(digest);
  const hmacBuf = Buffer.from(hmacHeader);
  if (digestBuf.length !== hmacBuf.length) return false;
  return timingSafeEqual(digestBuf, hmacBuf);
}
