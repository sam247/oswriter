import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizeShopDomain } from "@/lib/connectors/shopify/config";
import { buildOAuthState, verifyOAuthState } from "@/lib/connectors/shopify/state";
import { verifyCallbackHmac, verifyWebhookHmac } from "@/lib/connectors/shopify/oauth";
import { decryptSecret, encryptSecret } from "@/lib/security/secrets";
import type { ProjectShopifyConnectionSecret, ShopifyConnectionStatus } from "@/lib/types";

// --- Shop domain normalisation ---

test("normalizeShopDomain accepts a bare store name", () => {
  assert.equal(normalizeShopDomain("annadavies"), "annadavies.myshopify.com");
});

test("normalizeShopDomain accepts a full myshopify.com domain", () => {
  assert.equal(normalizeShopDomain("annadavies.myshopify.com"), "annadavies.myshopify.com");
});

test("normalizeShopDomain accepts an HTTPS URL", () => {
  assert.equal(normalizeShopDomain("https://annadavies.myshopify.com"), "annadavies.myshopify.com");
});

test("normalizeShopDomain normalises to lowercase", () => {
  assert.equal(normalizeShopDomain("AnNaDavies.myshopify.com"), "annadavies.myshopify.com");
});

test("normalizeShopDomain rejects non-myshopify domains", () => {
  assert.throws(() => normalizeShopDomain("annadavies.com"), /myshopify/);
});

test("normalizeShopDomain rejects empty input", () => {
  assert.throws(() => normalizeShopDomain(""), /required/i);
});

// --- OAuth state signing and verification ---

test("buildOAuthState and verifyOAuthState round-trip successfully", () => {
  const previous = process.env.OSW_SECRETS_KEY;
  process.env.OSW_SECRETS_KEY = "shopify-test-secret";
  try {
    const token = buildOAuthState({
      projectId: "proj_123",
      userId: "user_456",
      shop: "annadavies.myshopify.com",
    });
    const state = verifyOAuthState(token);
    assert.equal(state.projectId, "proj_123");
    assert.equal(state.userId, "user_456");
    assert.equal(state.shop, "annadavies.myshopify.com");
    assert.ok(state.exp > Math.floor(Date.now() / 1000));
  } finally {
    restoreEnv("OSW_SECRETS_KEY", previous);
  }
});

test("verifyOAuthState rejects a tampered token", () => {
  const previous = process.env.OSW_SECRETS_KEY;
  process.env.OSW_SECRETS_KEY = "shopify-test-secret";
  try {
    const token = buildOAuthState({
      projectId: "proj_123",
      userId: "user_456",
      shop: "annadavies.myshopify.com",
    });
    const tampered = `${token.slice(0, -3)}abc`;
    assert.throws(() => verifyOAuthState(tampered), /signature mismatch/i);
  } finally {
    restoreEnv("OSW_SECRETS_KEY", previous);
  }
});

test("verifyOAuthState rejects an expired token", () => {
  const previous = process.env.OSW_SECRETS_KEY;
  process.env.OSW_SECRETS_KEY = "shopify-test-secret";
  try {
    // Forge a state with an exp in the past.
    const state = {
      projectId: "proj_exp",
      userId: "user_exp",
      shop: "shop.myshopify.com",
      exp: Math.floor(Date.now() / 1000) - 1,
    };
    const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
    const sig = createHmac("sha256", "shopify-test-secret").update(payload).digest("base64url");
    const expiredToken = `${payload}.${sig}`;
    assert.throws(() => verifyOAuthState(expiredToken), /expired/i);
  } finally {
    restoreEnv("OSW_SECRETS_KEY", previous);
  }
});

// --- Callback HMAC verification ---

test("verifyCallbackHmac returns true for a valid Shopify callback HMAC", () => {
  const secret = "test-api-secret";
  const params = new URLSearchParams({
    code: "abc123",
    shop: "shop.myshopify.com",
    state: "my-state",
    timestamp: "1609459200",
  });
  const message = "code=abc123&shop=shop.myshopify.com&state=my-state&timestamp=1609459200";
  const hmac = createHmac("sha256", secret).update(message).digest("hex");
  params.set("hmac", hmac);

  assert.equal(verifyCallbackHmac(params, secret), true);
});

test("verifyCallbackHmac returns false for a tampered HMAC", () => {
  const params = new URLSearchParams({
    hmac: "0000000000000000000000000000000000000000000000000000000000000000",
    code: "abc123",
    shop: "shop.myshopify.com",
  });
  assert.equal(verifyCallbackHmac(params, "test-api-secret"), false);
});

test("verifyCallbackHmac returns false when hmac param is absent", () => {
  const params = new URLSearchParams({ code: "abc123", shop: "shop.myshopify.com" });
  assert.equal(verifyCallbackHmac(params, "test-api-secret"), false);
});

// --- Webhook HMAC verification ---

test("verifyWebhookHmac returns true for a valid webhook signature", () => {
  const secret = "webhook-secret";
  const body = JSON.stringify({ myshopify_domain: "shop.myshopify.com" });
  const hmac = createHmac("sha256", secret).update(body, "utf8").digest("base64");
  assert.equal(verifyWebhookHmac(body, hmac, secret), true);
});

test("verifyWebhookHmac returns false for an incorrect signature", () => {
  const body = JSON.stringify({ myshopify_domain: "shop.myshopify.com" });
  assert.equal(verifyWebhookHmac(body, "not-the-real-sig", "webhook-secret"), false);
});

// --- Encryption integration ---

test("Shopify access tokens are encrypted and decrypted correctly", () => {
  const previous = process.env.OSW_SECRETS_KEY;
  process.env.OSW_SECRETS_KEY = "shopify-test-secret";
  try {
    const token = "shpat_abc123def456";
    const encrypted = encryptSecret(token);
    assert.notEqual(encrypted, token);
    assert.equal(decryptSecret(encrypted), token);
  } finally {
    restoreEnv("OSW_SECRETS_KEY", previous);
  }
});

// --- Schema ---

test("Shopify connections migration adds a project-scoped connection table", () => {
  const schema = readFileSync("db/migrations/0024_shopify_connections.sql", "utf8");
  assert.match(schema, /create table if not exists project_shopify_connections/i);
  assert.match(schema, /project_id text primary key references projects\(id\) on delete cascade/i);
  assert.match(schema, /organisation_id text not null references organisations\(id\) on delete cascade/i);
  assert.match(schema, /created_by_user_id text not null references users\(id\)/i);
});

test("Shopify connections migration stores encrypted credentials and metadata", () => {
  const schema = readFileSync("db/migrations/0024_shopify_connections.sql", "utf8");
  assert.match(schema, /encrypted_access_token text not null/i);
  assert.match(schema, /connection_status text not null default 'not_connected'/i);
  assert.match(schema, /metadata jsonb not null/i);
  assert.match(schema, /document jsonb not null/i);
});

// --- Types alignment ---

test("ProjectShopifyConnectionSecret has required fields for persistence", () => {
  const now = new Date().toISOString();
  const secret: ProjectShopifyConnectionSecret = {
    projectId: "proj_test",
    shopDomain: "test.myshopify.com",
    encryptedAccessToken: "encrypted-value",
    grantedScopes: ["read_content", "write_content"],
    connectionStatus: "connected" as ShopifyConnectionStatus,
    metadata: {},
    installedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  assert.equal(secret.projectId, "proj_test");
  assert.equal(secret.connectionStatus, "connected");
  assert.equal(secret.grantedScopes.length, 2);
});

// --- Metadata shape ---

test("connectShopifyDestination metadata includes apiVersion and lastMetadataRefreshedAt", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.OSW_SECRETS_KEY;
  const previousApiKey = process.env.SHOPIFY_API_KEY;
  const previousApiSecret = process.env.SHOPIFY_API_SECRET;
  const previousAppUrl = process.env.SHOPIFY_APP_URL;
  const previousScopes = process.env.SHOPIFY_SCOPES;

  process.env.OSW_SECRETS_KEY = "metadata-test-secret";
  process.env.SHOPIFY_API_KEY = "test-key";
  process.env.SHOPIFY_API_SECRET = "test-secret";
  process.env.SHOPIFY_APP_URL = "https://test.example.com";
  process.env.SHOPIFY_SCOPES = "read_content";

  const shopMetaResponse = {
    data: {
      shop: {
        name: "Test Shop",
        myshopifyDomain: "test.myshopify.com",
        primaryDomain: null,
        currencyCode: "GBP",
        ianaTimezone: "Europe/London",
        primaryLocale: { locale: "en" },
      },
    },
  };

  const blogListResponse = {
    data: {
      blogs: {
        nodes: [
          { id: "gid://shopify/Blog/1", title: "News", handle: "news" },
        ],
      },
    },
  };

  let callCount = 0;
  globalThis.fetch = async () => {
    callCount++;
    const body = callCount === 1 ? shopMetaResponse : blogListResponse;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const { connectShopifyDestination } = await import("@/lib/connectors/shopify/connector");
    const { encryptSecret } = await import("@/lib/security/secrets");

    const token = "shpat_test_token";
    const result = await connectShopifyDestination({
      projectId: "proj_meta",
      shopDomain: "test.myshopify.com",
      accessToken: token,
      encryptedAccessToken: encryptSecret(token),
      grantedScopes: ["read_content"],
    });

    // API version recorded in metadata
    assert.equal(result.secret.metadata.apiVersion, "2025-01");

    // lastMetadataRefreshedAt recorded and is a valid ISO string
    assert.ok(typeof result.secret.metadata.lastMetadataRefreshedAt === "string");
    assert.doesNotThrow(() => new Date(result.secret.metadata.lastMetadataRefreshedAt as string));

    // availableBlogs (not legacy 'blogs') key used consistently
    assert.ok(Array.isArray(result.secret.metadata.availableBlogs));
    assert.equal((result.secret.metadata.availableBlogs as unknown[]).length, 1);
    assert.ok(!("blogs" in result.secret.metadata), "legacy 'blogs' key must not be present");

    // Public connection also carries the blogs
    assert.equal(result.publicConnection.availableBlogs.length, 1);
    assert.equal(result.publicConnection.availableBlogs[0]?.handle, "news");
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv("OSW_SECRETS_KEY", previousKey);
    restoreEnv("SHOPIFY_API_KEY", previousApiKey);
    restoreEnv("SHOPIFY_API_SECRET", previousApiSecret);
    restoreEnv("SHOPIFY_APP_URL", previousAppUrl);
    restoreEnv("SHOPIFY_SCOPES", previousScopes);
  }
});

test("getAvailableBlogs fetches blogs using the stored access token", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.OSW_SECRETS_KEY;
  const previousApiKey = process.env.SHOPIFY_API_KEY;
  const previousApiSecret = process.env.SHOPIFY_API_SECRET;
  const previousAppUrl = process.env.SHOPIFY_APP_URL;
  const previousScopes = process.env.SHOPIFY_SCOPES;

  process.env.OSW_SECRETS_KEY = "blogs-test-secret";
  process.env.SHOPIFY_API_KEY = "test-key";
  process.env.SHOPIFY_API_SECRET = "test-secret";
  process.env.SHOPIFY_APP_URL = "https://test.example.com";
  process.env.SHOPIFY_SCOPES = "read_content";

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          blogs: {
            nodes: [
              { id: "gid://shopify/Blog/42", title: "Journal", handle: "journal" },
              { id: "gid://shopify/Blog/99", title: "Updates", handle: "updates" },
            ],
          },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  const now = new Date().toISOString();

  try {
    const { getAvailableBlogs } = await import("@/lib/connectors/shopify/connector");
    const { encryptSecret } = await import("@/lib/security/secrets");
    const secret: ProjectShopifyConnectionSecret = {
      projectId: "proj_blogs",
      shopDomain: "test.myshopify.com",
      encryptedAccessToken: encryptSecret("shpat_blog_token"),
      grantedScopes: ["read_content"],
      connectionStatus: "connected",
      metadata: { apiVersion: "2025-01" },
      installedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const blogs = await getAvailableBlogs(secret);
    assert.equal(blogs.length, 2);
    assert.equal(blogs[0]?.handle, "journal");
    assert.equal(blogs[1]?.title, "Updates");
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv("OSW_SECRETS_KEY", previousKey);
    restoreEnv("SHOPIFY_API_KEY", previousApiKey);
    restoreEnv("SHOPIFY_API_SECRET", previousApiSecret);
    restoreEnv("SHOPIFY_APP_URL", previousAppUrl);
    restoreEnv("SHOPIFY_SCOPES", previousScopes);
  }
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
