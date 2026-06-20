import { runResearch } from "@/lib/research/research-engine";
import type { ResearchProvider, ResearchProviderInput, SourceDiscoveryProvider } from "@/lib/research/providers/types";
import type { ResearchProviderId } from "@/lib/types";

export class SearchBackedResearchProvider implements ResearchProvider {
  constructor(
    readonly id: ResearchProviderId,
    readonly label: string,
    private readonly discovery: SourceDiscoveryProvider
  ) {}

  async research(input: ResearchProviderInput) {
    return runResearch(
      input.title,
      input.articleId,
      this.discovery,
      input.profileSnapshot,
      input.contentProfile,
      this.id
    );
  }
}
