/**
 * Shopify publishing destination — OAuth state management.
 *
 * Produces and verifies short-lived, HMAC-signed state tokens so that the
 * OAuth callback can validate the projectId/userId that initiated the flow.
 * No database table needed — the state is self-contained and time-limited.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface ShopifyOAuthState {
  projectId: string;
  userId: string;
  shop: string;
  /** Unix seconds */
  exp: number;
}

const STATE_TTL_SECONDS = 600; // 10 minutes

function signingKey(): string {
  // Use the same env var as the secrets module so there is one secret to manage.
  return process.env.OSW_SECRETS_KEY ?? process.env.WORKSPACE_PASSWORD ?? "oswriter";
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function buildOAuthState(input: Omit<ShopifyOAuthState, "exp">): string {
  const state: ShopifyOAuthState = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifyOAuthState(token: string): ShopifyOAuthState {
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex === -1) throw new Error("Invalid state token.");

  const payload = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);

  const expected = sign(payload);
  const sigBuf = Buffer.from(sig, "base64url");
  const expectedBuf = Buffer.from(expected, "base64url");

  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error("State token signature mismatch.");
  }

  let state: ShopifyOAuthState;
  try {
    state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ShopifyOAuthState;
  } catch {
    throw new Error("State token could not be parsed.");
  }

  if (Math.floor(Date.now() / 1000) > state.exp) {
    throw new Error("State token has expired. Please restart the connection flow.");
  }

  return state;
}
