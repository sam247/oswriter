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
OSW_SECRETS_KEY="replace-with-a-long-random-secret"
CRON_SECRET="replace-with-a-worker-secret"
```

### Internal research benchmark

QueueWrite Research is the customer-facing production lane and uses Exa's default search. QueueWrite Research Experimental is registered for controlled internal benchmarks only and uses Exa Deep Search with the same evidence extraction, generation, and scoring pipeline.

Create the challenger explicitly through `ResearchProviderRegistry.create("queuewrite_experimental")`. It is not available through workspace preferences or customer UI.

Tavily is the first BYOK Experimental provider. A user saves and validates their own Tavily key in Settings before the BYOK option becomes selectable. The saved key is never returned to the browser after persistence, Tavily failures do not fall back to managed research, and the provider-neutral BYOK registry can replace Tavily later without changing the workspace preference contract.

The application deliberately does not read a platform `TAVILY_API_KEY`: doing so would turn customer BYOK requests into platform-funded traffic. Tavily Search starts at Basic depth. Reported credits are priced at $0.008 each (Basic: 1 credit/query; Advanced: 2 credits/query), and both credits and calculated USD provider cost are recorded. Cost remains missing if Tavily omits credit usage.

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

## Background Queue Execution

QueueWrite requires the background worker path to be configured in production:

- `CRON_SECRET`
- the worker drain endpoint at `/api/worker/drain`
- scheduled cron execution from `vercel.json`

The browser launches work and observes queue state. Background completion depends on the worker, not browser polling. Once generation has been started successfully, browser refreshes, tab closure, laptop sleep, or delayed return visits should not be required to keep the queue alive.

The queue contract is deliberately simple: article-quality concerns become `needs_review`; only technical failures become `failed`.

`AI_BASE_URL` should be the provider root, not the full chat endpoint. For DeepSeek use `https://api.deepseek.com`.

Article length is a configurable target stored in `settings.json`. It is not used as a hidden reliability lever; queue reliability comes from resumable processing and time-bounded stages.

`OSW_SECRETS_KEY` is used to encrypt project-scoped WordPress application passwords before persistence. Local development falls back to `WORKSPACE_PASSWORD` if this secret is unset, but production should always set a dedicated value.
