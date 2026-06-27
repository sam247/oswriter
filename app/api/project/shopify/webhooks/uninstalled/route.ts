import { NextResponse } from "next/server";
import { getShopifyConfig } from "@/lib/connectors/shopify/config";
import { normalizeShopDomain } from "@/lib/connectors/shopify/config";
import { verifyWebhookHmac } from "@/lib/connectors/shopify/oauth";
import { createRuntime } from "@/lib/server/runtime";
import { nowIso } from "@/lib/defaults";

// Shopify webhooks are not authenticated with QueueWrite session cookies —
// HMAC verification against the API secret is the auth mechanism here.

export async function POST(req: Request) {
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256") ?? "";
  const rawBody = await req.text();

  try {
    const config = getShopifyConfig();

    if (!verifyWebhookHmac(rawBody, hmacHeader, config.apiSecret)) {
      return NextResponse.json({ error: "Invalid webhook HMAC." }, { status: 401 });
    }

    let payload: { domain?: string; myshopify_domain?: string } = {};
    try {
      payload = JSON.parse(rawBody) as typeof payload;
    } catch {
      // Some uninstall payloads can be empty — proceed without.
    }

    const shopDomain = payload.myshopify_domain
      ? normalizeShopDomain(payload.myshopify_domain)
      : payload.domain
        ? normalizeShopDomain(payload.domain)
        : null;

    if (!shopDomain) {
      // Acknowledge without processing — Shopify will not retry on 200.
      return NextResponse.json({ ok: true });
    }

    const { store } = await createRuntime();

    // Find the project(s) that have this shop connected, then mark disconnected.
    const projects = await store.listProjects();
    const affected = projects.filter(
      (p) => p.publishing?.shopify?.shopDomain === shopDomain
    );

    if (affected.length > 0) {
      const now = nowIso();
      await Promise.all(
        affected.map(async (project) => {
          await store.deleteProjectShopifyConnection(project.id);
          const { shopify: _removed, ...publishingWithoutShopify } = project.publishing ?? {};
          await store.saveProject({
            ...project,
            publishing: publishingWithoutShopify,
            updatedAt: now,
          });
        })
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Return 200 to prevent Shopify retrying — log the error but don't fail.
    console.error("Shopify app/uninstalled webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}
