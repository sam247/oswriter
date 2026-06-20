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
    if (selected === "firecrawl" && !preferences.aiProvider.firecrawlApiKey?.trim()) {
      throw new Error("Firecrawl research cannot run without an API key.");
    }
    return this.registry.create(selected, preferences.aiProvider.firecrawlApiKey).research(input);
  }
}
