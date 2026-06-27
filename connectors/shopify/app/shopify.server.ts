import "@shopify/shopify-app-react-router/adapters/node";
import {
  LATEST_API_VERSION,
  shopifyApp,
} from "@shopify/shopify-app-react-router";
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";
import { join } from "node:path";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY ?? "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET ?? "",
  appUrl: process.env.SHOPIFY_APP_URL ?? "",
  scopes: (process.env.SHOPIFY_SCOPES ?? "read_content,write_content").split(","),
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: true,
  sessionStorage: new SQLiteSessionStorage(
    join(process.cwd(), "sessions.sqlite")
  ),
});

export default shopify;
export const authenticate = shopify.authenticate;
export const sessionStorage = shopify.sessionStorage;
