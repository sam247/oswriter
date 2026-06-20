# OS Writer V2

Reliable queue-first article generation workstation.

## Milestone 1 Stack

- Next.js 15 App Router
- TypeScript
- Tailwind
- Zustand-ready client architecture
- Vercel Blob JSON document persistence
- QueueWrite Research managed research engine
- Firecrawl BYOK research provider
- OpenAI-compatible AI generation, optional editor pass, and advisory validation

## Required Environment

Create `.env.local` for local development or set these in Vercel:

```bash
WORKSPACE_PASSWORD="change-me"
BLOB_READ_WRITE_TOKEN="vercel-blob-token"
QUEUEWRITE_RESEARCH_API_KEY="managed-research-key"
AI_API_KEY="deepseek-key"
AI_BASE_URL="https://api.deepseek.com"
AI_GENERATION_MODEL="deepseek-v4-flash"
AI_EDITOR_MODEL="deepseek-v4-flash"
AI_VALIDATION_MODEL="deepseek-v4-flash"
```

Firecrawl keys are stored per user from Settings and are not required for the default QueueWrite Research provider. Firecrawl cost telemetry can be converted from credits with `FIRECRAWL_COST_PER_CREDIT_USD`.

If `WORKSPACE_PASSWORD` is unset, local development accepts `oswriter`.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run test
npm run build
```

The queue contract is deliberately simple: article-quality concerns become `needs_review`; only technical failures become `failed`.

`AI_BASE_URL` should be the provider root, not the full chat endpoint. For DeepSeek use `https://api.deepseek.com`.

Article length is a configurable target stored in `settings.json`. It is not used as a hidden reliability lever; queue reliability comes from resumable processing and time-bounded stages.
