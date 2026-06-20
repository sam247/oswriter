# Internal Research Providers

QueueWrite Research is the only customer-facing research product. Provider selection and research-provider credentials must not be exposed in customer settings, onboarding, pricing, or marketing surfaces.

The provider registry remains extensible for benchmarks, internal QA, and future experiments. Firecrawl remains implemented in `lib/research/providers/firecrawl.ts` and registered internally.

## Firecrawl Test Access

Firecrawl routing is disabled by default. Set this server-only variable for controlled internal testing:

```bash
ENABLE_FIRECRAWL_PROVIDER=true
```

The workspace must already contain an internal Firecrawl preference and key. Public application state always projects QueueWrite Research and redacts research-provider credentials, including when the internal flag is enabled.

Historical provider telemetry, benchmark records, and comparison-sheet labels remain unchanged.
