import type { WorkspaceStore } from "@/lib/storage/storage";
import type { ResearchProvider, ResearchProviderInput } from "@/lib/research/providers/types";
import { createManagedResearchProvider } from "@/lib/research/providers/managed-router";
import { createQueueWriteResearchExperimentalProvider } from "@/lib/research/providers/queuewrite-experimental";
import type { ResearchPack, ResearchProviderId, ResearchProviderTelemetry } from "@/lib/types";

/** Internal registry used for benchmarks and testing. Not part of the user-facing research mode system. */
export class ResearchProviderRegistry {
  private readonly factories = new Map<ResearchProviderId, (apiKey?: string) => ResearchProvider>();

  constructor() {
    this.register("queuewrite", () => createManagedResearchProvider());
    this.register("queuewrite_experimental", () => createQueueWriteResearchExperimentalProvider());
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

/**
 * Routes research requests based on the workspace's chosen ResearchMode.
 *
 * - auto:       QueueWrite managed research (Tavily primary, Exa fallback). Fully transparent.
 * - auto_deep:  Coming soon. Architecture provisioned; not yet available.
 * - custom:     Bring Your Own Provider — routes to the user's configured provider (e.g. SerpAPI).
 */
export class WorkspaceResearchProvider implements ResearchProvider {
  readonly id = "queuewrite" as const;
  readonly label = "QueueWrite Research";

  constructor(
    private readonly store: WorkspaceStore,
    private readonly registry = new ResearchProviderRegistry()
  ) {}

  async research(input: ResearchProviderInput): Promise<ResearchPack> {
    const preferences = await this.store.getWorkspacePreferences();
    const mode = preferences.aiProvider.researchMode ?? "auto";

    if (mode === "auto_deep") {
      return unavailableResearchPack(input, "Auto Deep research is not yet available. Generation continued with standard managed research.", "auto_deep_unavailable");
    }

    if (mode === "custom") {
      try {
        if (!preferences.aiProvider.researchApiKey.trim()) throw new Error("Research API key is required for custom provider mode.");
        const { createCustomResearchProvider } = await import("@/lib/research/providers/byok");
        return withProviderTelemetry(
          await createCustomResearchProvider(
            preferences.aiProvider.customResearchProvider ?? "serpapi",
            preferences.aiProvider.researchApiKey
          ).research(input),
          {
            requestedResearchProvider: "byok",
            actualResearchProvider: "byok",
            fallbackUsed: false,
            fallbackReason: null
          }
        );
      } catch (error) {
        throw ResearchProviderError.from("byok", error);
      }
    }

    // auto mode — managed routing (Tavily primary, Exa fallback), fully internal
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
