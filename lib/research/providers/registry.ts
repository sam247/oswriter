import type { WorkspaceStore } from "@/lib/storage/storage";
import type { ResearchProvider, ResearchProviderInput } from "@/lib/research/providers/types";
import { createFirecrawlResearchProvider } from "@/lib/research/providers/firecrawl";
import { createQueueWriteResearchProvider } from "@/lib/research/providers/queuewrite";
import type { ResearchPack, ResearchProviderId, ResearchProviderTelemetry } from "@/lib/types";

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

  async research(input: ResearchProviderInput): Promise<ResearchPack> {
    const preferences = await this.store.getWorkspacePreferences();
    const selected = preferences.aiProvider.researchProvider ?? "queuewrite";
    if (selected === "queuewrite") {
      try {
        return withProviderTelemetry(await this.registry.create("queuewrite").research(input), {
          requestedResearchProvider: "queuewrite",
          actualResearchProvider: "queuewrite",
          fallbackUsed: false,
          fallbackReason: null
        });
      } catch (error) {
        return unavailableResearchPack(input, "QueueWrite Research was temporarily unavailable. Generation continued with limited evidence.", providerFailureReason(error));
      }
    }

    try {
      if (!preferences.aiProvider.firecrawlApiKey?.trim()) throw new Error("Firecrawl API key is unavailable.");
      return withProviderTelemetry(await this.registry.create("firecrawl", preferences.aiProvider.firecrawlApiKey).research(input), {
        requestedResearchProvider: "firecrawl",
        actualResearchProvider: "firecrawl",
        fallbackUsed: false,
        fallbackReason: null
      });
    } catch (error) {
      throw ResearchProviderError.from("firecrawl", error);
    }
  }
}

export class ResearchProviderError extends Error {
  readonly name = "ResearchProviderError";

  constructor(
    readonly provider: ResearchProviderId,
    readonly reason: string,
    readonly httpStatus: number | null,
    message: string
  ) {
    super(message);
  }

  static from(provider: ResearchProviderId, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = httpStatusFromMessage(message);
    return new ResearchProviderError(provider, providerFailureReason(error), status, providerFailureDisplayReason(error));
  }
}

function unavailableResearchPack(input: ResearchProviderInput, warning: string, fallbackReason: string): ResearchPack {
  const telemetry: ResearchProviderTelemetry = {
    requestedResearchProvider: "queuewrite",
    actualResearchProvider: "queuewrite",
    fallbackUsed: true,
    fallbackReason
  };
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
    ...telemetry,
    providerUsage: { ...telemetry },
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

function withProviderTelemetry(pack: ResearchPack, telemetry: ResearchProviderTelemetry): ResearchPack {
  return { ...pack, ...telemetry, providerUsage: { ...pack.providerUsage, ...telemetry } };
}

function providerFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/402|credit|quota/i.test(message)) return "quota_exhausted";
  if (/429|rate limit/i.test(message)) return "rate_limited";
  if (/timeout|aborted/i.test(message)) return "timeout";
  if (/api key|unauthorized|401|403/i.test(message)) return "authentication";
  return "provider_unavailable";
}

function providerFailureDisplayReason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = httpStatusFromMessage(message);
  if (status === 402 || /credit|quota/i.test(message)) return "Quota exceeded (HTTP 402)";
  if (status === 429 || /rate limit/i.test(message)) return "Rate limit exceeded (HTTP 429)";
  if (/timeout|aborted/i.test(message)) return "Provider timeout";
  if (/api key|unauthorized|401|403/i.test(message)) return status ? `Authentication failed (HTTP ${status})` : "Authentication failed";
  return status ? `Provider unavailable (HTTP ${status})` : "Provider unavailable";
}

function httpStatusFromMessage(message: string) {
  const match = message.match(/(?:^|\s)([45]\d\d)(?:\s|$)/);
  return match ? Number(match[1]) : null;
}
