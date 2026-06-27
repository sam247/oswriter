# QueueWrite Shopify Publishing Destination

## Product Ownership

**The Shopify Partner application is a lightweight authentication bridge — not the primary product interface.**

QueueWrite is the canonical application for research, generation, review, validation, publishing, and project management. Shopify is a publishing destination. The Partner app exists because Shopify requires an installable app for OAuth. It displays a single "Return to QueueWrite" page and nothing else.

---

## Architecture

```
QueueWrite (app.queuewrite.com)
├── app/api/project/shopify/
│   ├── connect/route.ts          ← Initiates OAuth → redirects to Shopify
│   ├── callback/route.ts         ← Receives OAuth callback, stores encrypted token
│   ├── health/route.ts           ← GraphQL health check
│   ├── route.ts                  ← DELETE: disconnect store
│   └── webhooks/uninstalled/     ← Marks disconnected on app/uninstalled
│
├── lib/connectors/shopify/
│   ├── config.ts                 ← Env var validation, domain normalisation
│   ├── oauth.ts                  ← Authorize URL, HMAC verify, token exchange
│   ├── graphql.ts                ← GraphQL Admin API client (used for all phases)
│   ├── state.ts                  ← HMAC-signed OAuth state tokens
│   └── connector.ts              ← connect, health, disconnect functions
│
└── lib/storage/
    └── project_shopify_connections   ← Encrypted access tokens per project

connectors/shopify/ (separate Shopify Partner app)
├── app/routes/app._index.tsx     ← "QueueWrite is connected. Open QueueWrite."
└── app/routes/webhooks.app.uninstalled.tsx
```

All OAuth token storage happens in **QueueWrite** — tokens never touch the Shopify Partner app server.

---

## OAuth Flow

1. Merchant navigates to **Project Settings → Shopify** in QueueWrite.
2. Merchant enters their `.myshopify.com` domain and clicks **Connect Shopify Store**.
3. QueueWrite redirects to `/api/project/shopify/connect?projectId=...&shop=...`.
4. The connect route builds a signed `state` token and redirects to `https://<shop>/admin/oauth/authorize`.
5. Merchant grants permissions in the Shopify admin.
6. Shopify redirects to `{APP_BASE_URL}/api/project/shopify/callback?code=...&shop=...&hmac=...&state=...`.
7. The callback route:
   - Verifies Shopify's HMAC on the callback params.
   - Verifies the signed state (including expiry check).
   - Exchanges the code for an offline access token.
   - Calls the GraphQL Admin API to capture shop metadata and available blogs.
   - Encrypts the access token with AES-256-GCM.
   - Dual-writes: public connection on the project document, encrypted secret in `project_shopify_connections`.
8. Redirects merchant to `{APP_BASE_URL}/?projectSettings={projectId}&shopify=connected`.
9. QueueWrite shows `✓ Shopify Connected — annadavies.myshopify.com`.

---

## GraphQL Foundation

All Shopify API access uses the **GraphQL Admin API** (`/admin/api/{version}/graphql.json`). REST is not used.

### Phase 1 queries (implemented)

```graphql
# Shop metadata on install
query ShopMetadata {
  shop {
    name
    myshopifyDomain
    primaryDomain { host }
    currencyCode
    ianaTimezone
    primaryLocale { locale }
  }
}

# Available blogs for metadata capture
query BlogList {
  blogs(first: 50) {
    nodes { id title handle }
  }
}

# Health check
query HealthCheck {
  shop { name }
}
```

The `ShopifyGraphQLClient` in `lib/connectors/shopify/graphql.ts` is the single client for all current and future phases.

### Future phases (not implemented)

- **Phase 2**: `blogCreate`, `articleCreate`, `articleUpdate`, `fileCreate` (featured images)
- **Phase 3**: `products`, `collections`, `metafields`, content gap queries

---

## Local Development

### Prerequisites

- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli) installed globally (`npm install -g @shopify/cli`)
- Shopify [Partner account](https://partners.shopify.com)
- A [development store](https://help.shopify.com/en/partners/dashboard/managing-stores/development-stores)

### Setup

**1. Create a Shopify Partner app**

In the [Partner dashboard](https://partners.shopify.com/), create a new app:
- Choose **Custom app**
- Set the App URL and redirect URL once you have the QueueWrite tunnel URL

**2. Configure QueueWrite environment**

```bash
# .env.local
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_APP_URL=https://<tunnel>.trycloudflare.com  # Shopify Partner app tunnel
SHOPIFY_SCOPES=read_content,write_content
OSW_SECRETS_KEY=your-32-char-secret-for-encrypting-tokens
```

**3. Configure the Partner app**

```bash
cd connectors/shopify
cp .env.example .env
# Fill in .env with the same SHOPIFY_API_KEY and SHOPIFY_API_SECRET
```

**4. Run both apps**

```bash
# Terminal 1 — QueueWrite
npm run dev

# Terminal 2 — Shopify Partner app (provides tunnel)
npm run dev:shopify
```

Shopify CLI will output the tunnel URL. Set `SHOPIFY_APP_URL` in the Partner dashboard and in QueueWrite's `.env.local`.

**5. Register the redirect URL**

In the Partner dashboard → App setup → URLs:
- **App URL**: `https://<shopify-tunnel>`
- **Allowed redirection URLs**: `https://<queuewrite-tunnel>/api/project/shopify/callback`

**6. Install and test**

In QueueWrite → Project Settings → Shopify, enter your dev store domain and click **Connect Shopify Store**.

---

## Deployment

### Shopify Partner app

```bash
cd connectors/shopify
shopify app deploy
```

This pushes `shopify.app.toml` (scopes, webhooks) to the Partner dashboard. The app itself is hosted separately (Vercel, Fly, etc.).

Update `shopify.app.toml` with production URLs before deploying:
- `application_url` → your Partner app production URL
- `redirect_urls` → `https://app.queuewrite.com/api/project/shopify/callback`
- Webhook URI → `https://app.queuewrite.com/api/project/shopify/webhooks/uninstalled`

### QueueWrite

Set environment variables on Vercel (or your host) — see Environment Variables section.

---

## Environment Variables

### QueueWrite (main app)

| Variable | Required | Description |
|---|---|---|
| `SHOPIFY_API_KEY` | Yes | Partner app API key (client ID) |
| `SHOPIFY_API_SECRET` | Yes | Partner app secret — server only, never exposed |
| `SHOPIFY_APP_URL` | Yes | Shopify Partner app public URL |
| `SHOPIFY_SCOPES` | Yes | Comma-separated OAuth scopes (e.g. `read_content,write_content`) |
| `SHOPIFY_API_VERSION` | No | GraphQL API version — default `2025-01` |
| `OSW_SECRETS_KEY` | Yes (prod) | 32+ character key for AES-256-GCM token encryption |
| `APP_BASE_URL` / `NEXT_PUBLIC_APP_URL` | Yes | QueueWrite app base URL (for OAuth callback) |

### Partner app (`connectors/shopify/.env`)

| Variable | Purpose |
|---|---|
| `SHOPIFY_API_KEY` | Same Partner app API key |
| `SHOPIFY_API_SECRET` | Same Partner app secret |
| `SHOPIFY_APP_URL` | This app's public URL (populated by CLI tunnel in dev) |
| `QUEUEWRITE_APP_URL` | Link target for "Open QueueWrite" button |
| `SHOPIFY_SCOPES` | Must match QueueWrite's `SHOPIFY_SCOPES` |

---

## Connection Lifecycle

| Event | Handler |
|---|---|
| Merchant clicks Connect | `GET /api/project/shopify/connect` → OAuth redirect |
| OAuth callback | `GET /api/project/shopify/callback` → token exchange + metadata |
| Health check | `POST /api/project/shopify/health` → GraphQL `shop.name` query |
| Disconnect (QueueWrite) | `DELETE /api/project/shopify` → removes secret + clears project |
| App uninstalled (webhook) | `POST /api/project/shopify/webhooks/uninstalled` → marks disconnected |

---

## Future Roadmap

### Phase 2 — Article publishing

- Publish draft to a Shopify blog
- Publish live
- Blog selection UI in QueueWrite
- Featured image upload via `fileCreate`
- Article update and delete

### Phase 3 — Product and collection intelligence

- List products and collections for internal linking
- SEO metadata suggestions from product data
- Product description generation
- Collection description generation
- Content gap analysis against product catalog

### Architecture note

A shared publishing destination interface (covering WordPress, Shopify, Ghost, etc.) will be introduced after WordPress is migrated into the `lib/connectors/` pattern. The interface will emerge from two real implementations rather than being designed theoretically.
