/**
 * Shopify app/uninstalled webhook handler.
 *
 * When a merchant uninstalls QueueWrite from Shopify, this route receives the
 * webhook and forwards the disconnect to QueueWrite. The actual credential
 * cleanup is handled by QueueWrite's webhook endpoint.
 *
 * This route exists as a secondary path — QueueWrite's own webhook endpoint
 * is registered directly in shopify.app.toml and handles cleanup. This file
 * is kept for completeness and for partner-app-side acknowledgement.
 */
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  if (topic === "APP_UNINSTALLED") {
    // QueueWrite handles cleanup via its own registered webhook endpoint.
    // Log for observability purposes.
    console.log(`QueueWrite Shopify bridge: app uninstalled for shop ${shop}`);
  }

  return json({ ok: true });
};
