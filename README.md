# OS Writer V2

Reliable queue-first article generation workstation.

## Milestone 1 Stack

- Next.js 15 App Router
- TypeScript
- Tailwind
- Zustand-ready client architecture
- Vercel Blob JSON document persistence
- QueueWrite Research managed research engine
- OpenAI-compatible AI generation, optional editor pass, and advisory validation

## Required Environment

Create `.env.local` for local development or set these in Vercel:

```bash
BLOB_READ_WRITE_TOKEN="vercel-blob-token"
QUEUEWRITE_RESEARCH_API_KEY="managed-research-key"
AI_API_KEY="deepseek-key"
AI_BASE_URL="https://api.deepseek.com"
AI_GENERATION_MODEL="deepseek-v4-flash"
AI_EDITOR_MODEL="deepseek-v4-flash"
AI_VALIDATION_MODEL="deepseek-v4-flash"
OSW_SECRETS_KEY="replace-with-a-long-random-secret"
AUTH_SECRET="replace-with-a-long-random-secret"
AUTH_BACKEND="neon"
MAIL_BACKEND="resend"
DATABASE_URL="postgres://..."
RESEND_API_KEY="re_xxxxx"
RESEND_FROM_EMAIL="QueueWrite <auth@queuewrite.com>"
NEXT_PUBLIC_MARKETING_URL="https://queuewrite.com"
NEXT_PUBLIC_APP_URL="https://app.queuewrite.com"
MARKETING_BASE_URL="https://queuewrite.com"
APP_BASE_URL="https://app.queuewrite.com"
CRON_SECRET="replace-with-a-worker-secret"
```

For local Playwright runs, the suite overrides the production defaults with:

```bash
ENABLE_TEST_API=1
AUTH_BACKEND=memory
MAIL_BACKEND=memory
STORAGE_BACKEND=memory
```

### Internal research benchmark

QueueWrite Research is the customer-facing production lane and uses Exa's default search. QueueWrite Research Experimental is registered for controlled internal benchmarks only and uses Exa Deep Search with the same evidence extraction, generation, and scoring pipeline.

Create the challenger explicitly through `ResearchProviderRegistry.create("queuewrite_experimental")`. It is not available through workspace preferences or customer UI.

Tavily is the first BYOK Experimental provider. A user saves and validates their own Tavily key in Settings before the BYOK option becomes selectable. The saved key is never returned to the browser after persistence, Tavily failures do not fall back to managed research, and the provider-neutral BYOK registry can replace Tavily later without changing the workspace preference contract.

The application deliberately does not read a platform `TAVILY_API_KEY`: doing so would turn customer BYOK requests into platform-funded traffic. Tavily Search starts at Basic depth. Reported credits are priced at $0.008 each (Basic: 1 credit/query; Advanced: 2 credits/query), and both credits and calculated USD provider cost are recorded. Cost remains missing if Tavily omits credit usage.

`AUTH_BACKEND=neon` stores OTPs and sessions in Neon for production. `MAIL_BACKEND=resend` routes authentication and queue completion emails through the shared mail service. `STORAGE_BACKEND=neon` is the intended production workspace backend for tenant-aware application data.

## Development

```bash
npm install
npm run dev
```

## Route Responsibilities

- `queuewrite.com/` serves the public QueueWrite marketing homepage.
- `/features`, `/pricing`, `/contact`, `/blog`, and `/blog/[slug]` are public marketing and content routes.
- `app.queuewrite.com/` is the authenticated QueueWrite workspace root.
- `app.queuewrite.com/login`, `/signup`, `/verify`, `/forgot-password`, `/reset-password`, `/settings`, `/settings/billing`, and `/projects` are application-only routes.
- `/dashboard` now redirects to `/` on the app host for backward compatibility.
- `/sitemap.xml` is generated from the public App Router pages plus blog posts so new marketing pages and blog entries are included automatically.

## Authentication

- QueueWrite no longer uses a shared workspace password.
- Sign up and sign in both use email plus a single-use 6-digit OTP.
- OTPs expire after 10 minutes and are rate limited before delivery.
- Verified sessions are stored in secure HTTP-only cookies on the application subdomain only.
- The marketing site never authenticates users and only links into `app.queuewrite.com`.

## Mail Delivery

- All transactional email flows use the centralized mail service in `lib/mail/service.ts`.
- Resend is the production delivery provider for:
  - signup and login OTPs
  - future auth mail
  - queue completion notifications
- Test and local verification can switch the mail layer to the in-memory backend without changing application code.

## Verification

```bash
npm run test
npm run build
npm run test:e2e
```

Playwright starts the app with `STORAGE_BACKEND=memory` so route/auth/billing coverage can run locally without Blob credentials.
It also enables `ENABLE_TEST_API=1` so the E2E suite can deterministically inspect auth flows without exposing test helpers in production.

## Background Queue Execution

QueueWrite requires the background worker path to be configured in production:

- `CRON_SECRET`
- the worker drain endpoint at `/api/worker/drain`
- scheduled cron execution from `vercel.json`

The browser launches work and observes queue state. Background completion depends on the worker, not browser polling. Once generation has been started successfully, browser refreshes, tab closure, laptop sleep, or delayed return visits should not be required to keep the queue alive.

The queue contract is deliberately simple: article-quality concerns become `needs_review`; only technical failures become `failed`.

`AI_BASE_URL` should be the provider root, not the full chat endpoint. For DeepSeek use `https://api.deepseek.com`.

Article length is a configurable target stored in `settings.json`. It is not used as a hidden reliability lever; queue reliability comes from resumable processing and time-bounded stages.

`OSW_SECRETS_KEY` is used to encrypt project-scoped WordPress application passwords before persistence. Local development still falls back to `WORKSPACE_PASSWORD` for encryption compatibility if this secret is unset, but the workspace password is no longer used as an application login mechanism and production should always set a dedicated secret.
