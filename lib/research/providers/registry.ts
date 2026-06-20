import type { WorkspaceStore } from "@/lib/storage/storage";
import type { ResearchProvider, ResearchProviderInput } from "@/lib/research/providers/types";
import { createFirecrawlResearchProvider } from "@/lib/research/providers/firecrawl";
import { createQueueWriteResearchProvider } from "@/lib/research/providers/queuewrite";
import type { ResearchProviderId } from "@/lib/types";

export const RESEARCH_PROVIDER_OPTIONS: ReadonlyArray<{ id: ResearchProviderId; label: string; requiresApiKey: boolean }> = [
  { id: "queuewrite", label: "QueueWrite Research", requiresApiKey: false },
  { id: "firecrawl", label: "Firecrawl", requiresApiKey: true }
];

export class ResearchProviderRegistry {
  private readonly factories = new Map<ResearchProviderId, (apiKey?: string) => ResearchProvider>();

  constructor() {
    this.register("queuewrite", () => createQueueWriteResearchProvider());
    this.register("firecrawl", (apiKey) => createFirecrawlResearchProvider(apiKey ?? ""));
  }

  register(id: ResearchProviderId, factory: (apiKey?: string) => ResearchProvider) {
    this.factories.set(id, factory);
    return this;
  }

  create(id: ResearchProviderId, apiKey?: string) {
    const factory = this.factories.get(id);
    if (!factory) throw new Error(`Research provider is not registered: ${id}`);
    return factory(apiKey);
  }
}

export class WorkspaceResearchProvider implements ResearchProvider {
  readonly id = "queuewrite" as const;
  readonly label = "QueueWrite Research";

  constructor(private readonly store: WorkspaceStore, private readonly registry = new ResearchProviderRegistry()) {}

  async research(input: ResearchProviderInput) {
    const preferences = await this.store.getWorkspacePreferences();
    const selected = preferences.aiProvider.researchProvider ?? "queuewrite";
    if (selected === "queuewrite") {
      try {
        return await this.registry.create("queuewrite").research(input);
      } catch {
        return unavailableResearchPack(input, "QueueWrite Research was temporarily unavailable. Generation continued with limited evidence.", "provider_unavailable", "queuewrite");
      }
    }

    try {
      if (!preferences.aiProvider.firecrawlApiKey?.trim()) throw new Error("Firecrawl API key is unavailable.");
      return await this.registry.create("firecrawl", preferences.aiProvider.firecrawlApiKey).research(input);
    } catch (error) {
      try {
        const fallback = await this.registry.create("queuewrite").research(input);
        return {
          ...fallback,
          warnings: [...fallback.warnings, "BYOK research was unavailable, so QueueWrite Research completed this run."],
          providerUsage: {
            ...fallback.providerUsage,
            requestedProvider: "firecrawl",
            fallbackProvider: "queuewrite",
            fallbackReason: providerFailureReason(error)
          }
        };
      } catch {
        return unavailableResearchPack(input, "Research providers were temporarily unavailable. Generation continued with limited evidence.", providerFailureReason(error));
      }
    }
  }
}

function unavailableResearchPack(input: ResearchProviderInput, warning: string, fallbackReason = "provider_unavailable", requestedProvider: ResearchProviderId = "firecrawl") {
  return {
    articleId: input.articleId,
    title: input.title,
    contentProfile: input.contentProfile ?? "industry_explainer",
    researchProvider: "queuewrite" as const,
    sourcesFound: 0,
    evidenceItemsExtracted: 0,
    evidenceItemsUsed: 0,
    researchCostUsd: 0,
    costPerSource: 0,
    costPerAcceptedSource: 0,
    costPerEvidenceItem: 0,
    providerUsage: { requestedProvider, fallbackProvider: "queuewrite", fallbackReason },
    queries: [],
    sources: [],
    rejectedSources: [],
    usefulFacts: [],
    rejectedFacts: [],
    questionsFound: [],
    headingsFound: [],
    authorityScore: 0,
    relevanceScore: 0,
    confidence: 0,
    warnings: [warning],
    requestIds: [],
    durationMs: 0,
    profileSnapshot: input.profileSnapshot ?? null,
    createdAt: new Date().toISOString()
  };
}

function providerFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/402|credit|quota/i.test(message)) return "quota_exhausted";
  if (/429|rate limit/i.test(message)) return "rate_limited";
  if (/timeout|aborted/i.test(message)) return "timeout";
  if (/api key|unauthorized|401|403/i.test(message)) return "authentication";
  return "provider_unavailable";
}
