# Research Provider Architecture

QueueWrite sells **QueueWrite Research** — a product, not a vendor. Provider names are never exposed to users. This document covers internal architecture only.

---

## User-facing research modes

Users see and choose between three modes:

| Mode | Label | Status |
|---|---|---|
| `auto` | Auto (Recommended) | Live |
| `auto_deep` | Auto Deep | Coming Soon |
| `custom` | Bring Your Own Provider | Live (SerpAPI stub) |

Provider names (Tavily, Exa, SerpAPI) must **never** appear in the managed experience, pricing pages, or marketing copy.

---

## Internal routing

### Auto

The managed research router (`lib/research/providers/managed-router.ts`) handles all routing transparently:

```
Auto
  └─ ManagedResearchDiscoveryProvider
       ├─ Primary:  Tavily  (QUEUEWRITE_TAVILY_API_KEY / TAVILY_API_KEY)
       └─ Fallback: Exa     (QUEUEWRITE_RESEARCH_API_KEY / EXA_API_KEY)
```

Fallback is silent. Users see only "Auto." Provider selection, routing logic, and fallback behaviour are implementation details that can evolve freely without any UI change.

### Auto Deep

Provisioned in the enum and UI (marked Coming Soon, disabled). No execution implemented. Reserved for:

- Tavily Deep Search
- Exa Deep Search

### Custom (Bring Your Own Provider)

Routes to the user's own configured provider using their API key. Currently provisioned for:

| Provider | Status |
|---|---|
| SerpAPI | Stub — not yet implemented |
| DataForSEO | Roadmap |
| Firecrawl | Roadmap |

BYOK failures are hard errors — no managed fallback is applied. Users using custom mode are responsible for their own API key validity and quota.

---

## Internal provider IDs

The `ResearchProviderId` enum (`"queuewrite" | "queuewrite_experimental" | "byok"`) is used for telemetry and the internal registry. It is never exposed to users.

| ID | Meaning |
|---|---|
| `queuewrite` | Managed production (Auto mode internally) |
| `queuewrite_experimental` | Exa Deep Search — benchmarks only |
| `byok` | Custom (BYOK) provider mode |

---

## Backwards compatibility

Existing `user_provider_preferences` records storing `researchProvider: "byok"` (old Tavily BYOK) are automatically migrated to `researchMode: "auto"` on read. Tavily is now fully managed internally. No user action required.

---

## Adding a new managed provider

1. Add implementation in `lib/research/providers/` (e.g. a new search adapter).
2. Update `ManagedResearchDiscoveryProvider` in `managed-router.ts`.
3. No UI changes required. Users continue using "Auto."

## Adding a new BYOK provider

1. Add implementation in `lib/research/providers/` (new adapter).
2. Add to `CustomResearchProvider` union in `lib/types.ts`.
3. Add to `CUSTOM_RESEARCH_PROVIDERS` array in `lib/research/providers/byok.ts`.
4. Add case to `createCustomResearchProvider` in `byok.ts`.
5. Update UI in `SettingsPanel` if provider requires different credential fields.
