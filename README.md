# OS Writer V2

Reliable queue-first article generation workstation.

## Milestone 1 Stack

- Next.js 15 App Router
- TypeScript
- Tailwind
- Zustand-ready client architecture
- Vercel Blob JSON document persistence
- Exa Search research adapter
- OpenAI-compatible AI generation, optional editor pass, and advisory validation

## Required Environment

Create `.env.local` for local development or set these in Vercel:

```bash
WORKSPACE_PASSWORD="change-me"
BLOB_READ_WRITE_TOKEN="vercel-blob-token"
EXA_API_KEY="exa-key"
AI_API_KEY="deepseek-key"
AI_BASE_URL="https://api.deepseek.com"
AI_GENERATION_MODEL="deepseek-v4-flash"
AI_EDITOR_MODEL="deepseek-v4-flash"
AI_VALIDATION_MODEL="deepseek-v4-flash"
```

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
