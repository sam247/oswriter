import { vitePlugin as remix } from "@react-router/dev/vite";
import { shopifyApp } from "@shopify/shopify-app-react-router/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    shopifyApp(),
    remix({
      ignoredRouteFiles: ["**/.*"],
    }),
    tsconfigPaths(),
  ],
});
