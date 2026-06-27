/**
 * Shopify publishing destination — core operations.
 *
 * Implements connect, disconnect, and health for the Shopify publishing
 * destination. Plain exported functions — not a formal interface (the shared
 * destination abstraction is deferred until WordPress is migrated).
 *
 * Phase 2 extension points: publishDraft, publishLive, updateArticle, deleteArticle.
 * Phase 3 extension points: listProducts, listCollections.
 */

import { decryptSecret } from "@/lib/security/secrets";
import { nowIso } from "@/lib/defaults";
import { getShopifyConfig } from "./config";
import { ShopifyGraphQLClient } from "./graphql";
import type { ProjectShopifyConnection, ProjectShopifyConnectionSecret, ShopifyBlogSummary, ShopifyConnectionStatus } from "@/lib/types";

export interface ConnectShopifyInput {
  projectId: string;
  organisationId?: string;
  createdByUserId?: string;
  shopDomain: string;
  accessToken: string;
  encryptedAccessToken: string;
  grantedScopes: string[];
}

export interface ConnectShopifyResult {
  publicConnection: ProjectShopifyConnection;
  secret: ProjectShopifyConnectionSecret;
}

/**
 * Fetch shop metadata and blogs via GraphQL, then build the public + secret
 * records to persist. Called after a successful OAuth token exchange.
 */
export async function connectShopifyDestination(input: ConnectShopifyInput): Promise<ConnectShopifyResult> {
  const config = getShopifyConfig();
  const client = new ShopifyGraphQLClient(input.shopDomain, input.accessToken, config.apiVersion);

  const [shopMeta, blogs] = await Promise.all([
    client.getShopMetadata(),
    client.listBlogs(),
  ]);

  const now = nowIso();

  const publicConnection: ProjectShopifyConnection = {
    shopDomain: input.shopDomain,
    shopName: shopMeta.name,
    primaryLocale: shopMeta.primaryLocale,
    currency: shopMeta.currencyCode,
    timezone: shopMeta.ianaTimezone,
    grantedScopes: input.grantedScopes,
    availableBlogs: blogs,
    accessTokenConfigured: true,
    connectionStatus: "connected",
    installedAt: now,
    lastValidatedAt: now,
    lastError: null,
    updatedAt: now,
  };

  const secret: ProjectShopifyConnectionSecret = {
    projectId: input.projectId,
    organisationId: input.organisationId,
    createdByUserId: input.createdByUserId,
    shopDomain: input.shopDomain,
    encryptedAccessToken: input.encryptedAccessToken,
    grantedScopes: input.grantedScopes,
    connectionStatus: "connected",
    metadata: {
      shopName: shopMeta.name,
      myshopifyDomain: shopMeta.myshopifyDomain,
      primaryDomain: shopMeta.primaryDomain,
      currencyCode: shopMeta.currencyCode,
      ianaTimezone: shopMeta.ianaTimezone,
      primaryLocale: shopMeta.primaryLocale,
      // Available blogs stored under the same key as the public connection field
      // so Phase 2 publishing code can read either source consistently.
      availableBlogs: blogs,
      apiVersion: config.apiVersion,
      lastMetadataRefreshedAt: now,
    },
    installedAt: now,
    lastValidatedAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  return { publicConnection, secret };
}

/**
 * Retrieve the list of blogs available on a connected store.
 *
 * Decrypts the stored access token and queries the GraphQL Admin API.
 * Phase 2 publishing code should call this rather than constructing a
 * GraphQL client directly — it encapsulates auth and client wiring.
 */
export async function getAvailableBlogs(
  secret: ProjectShopifyConnectionSecret
): Promise<ShopifyBlogSummary[]> {
  const config = getShopifyConfig();
  const accessToken = decryptSecret(secret.encryptedAccessToken);
  const client = new ShopifyGraphQLClient(secret.shopDomain, accessToken, config.apiVersion);
  return client.listBlogs();
}

/**
 * Run a lightweight GraphQL health check against the stored access token.
 * Returns the updated public connection status.
 */
export async function checkShopifyDestinationHealth(
  existing: ProjectShopifyConnectionSecret
): Promise<Pick<ProjectShopifyConnection, "connectionStatus" | "lastValidatedAt" | "lastError">> {
  const config = getShopifyConfig();
  const now = nowIso();

  let status: ShopifyConnectionStatus;
  let lastError: string | null = null;

  try {
    const accessToken = decryptSecret(existing.encryptedAccessToken);
    const client = new ShopifyGraphQLClient(existing.shopDomain, accessToken, config.apiVersion);
    await client.healthCheck();
    status = "connected";
  } catch (err) {
    status = "failed";
    lastError = err instanceof Error ? err.message : "Health check failed.";
  }

  return { connectionStatus: status, lastValidatedAt: now, lastError };
}

/**
 * Build a disconnected public connection record. Storage deletion is the
 * caller's responsibility.
 */
export function buildDisconnectedShopifyConnection(
  existing: ProjectShopifyConnection
): ProjectShopifyConnection {
  return {
    ...existing,
    accessTokenConfigured: false,
    connectionStatus: "not_connected",
    lastError: null,
    updatedAt: nowIso(),
  };
}
