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
WORKSPACE_PASSWORD="change-me"
BLOB_READ_WRITE_TOKEN="vercel-blob-token"
QUEUEWRITE_RESEARCH_API_KEY="managed-research-key"
AI_API_KEY="deepseek-key"
AI_BASE_URL="https://api.deepseek.com"
AI_GENERATION_MODEL="deepseek-v4-flash"
AI_EDITOR_MODEL="deepseek-v4-flash"
AI_VALIDATION_MODEL="deepseek-v4-flash"
```

### Internal QueueWrite Research v2 benchmark

QueueWrite Research v2 is an internal-only provider. It is registered for controlled benchmarks but is intentionally absent from customer settings and is never selected by the production runtime. It keeps Exa discovery, enriches each candidate page with Crawl4AI fit markdown, then uses the existing evidence extraction and research-pack pipeline.

```bash
QUEUEWRITE_V2_CRAWL4AI_BASE_URL="http://localhost:11235"
QUEUEWRITE_V2_CRAWL4AI_API_TOKEN="optional-internal-token"
QUEUEWRITE_V2_CRAWL4AI_COST_PER_PAGE_USD="0"
```

The initial Crawl4AI profile uses main-content cleanup, fit markdown, pruning, noise selectors, and overlay/form removal. Deep/adaptive crawling, domain mapping, identity crawling, virtual scroll, sessions, hooks, proxies, and page authentication are not configured. Create it explicitly through `ResearchProviderRegistry.create("queuewrite_v2")`; do not add it to workspace preferences or the customer provider selector.

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
