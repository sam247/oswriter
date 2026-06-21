# Internal Research Providers

QueueWrite Research is the only customer-facing research product. Provider selection and research-provider credentials must not be exposed in customer settings, onboarding, pricing, or marketing surfaces.

The launch architecture has three lanes:

- `queuewrite`: production, Exa default search.
- `queuewrite_experimental`: internal challenger, Exa Deep Search.
- `byok`: inactive placeholder for a future provider.

Production and experimental share the same research-pack, evidence extraction, generation, validation, and scoring pipeline. The experimental lane is created explicitly for controlled benchmarks:

```ts
new ResearchProviderRegistry().create("queuewrite_experimental")
```

BYOK has no provider, credentials, routing, telemetry, or customer UI. The registry and provider interfaces are retained so a provider can be added later without changing the production lane.
