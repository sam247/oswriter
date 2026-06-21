import { ExaSearchAdapter } from "@/lib/research/exa";
import { SearchBackedResearchProvider } from "@/lib/research/providers/search-backed";
import type { SourceDiscoveryProvider } from "@/lib/research/providers/types";

export class QueueWriteExperimentalDiscoveryProvider extends ExaSearchAdapter implements SourceDiscoveryProvider {
  readonly providerId = "queuewrite_experimental" as const;

  constructor(fetcher: typeof fetch = fetch) {
    super({ searchType: "deep", providerId: "queuewrite_experimental" }, fetcher);
  }
}

export function createQueueWriteResearchExperimentalProvider() {
  return new SearchBackedResearchProvider(
    "queuewrite_experimental",
    "QueueWrite Research Experimental",
    new QueueWriteExperimentalDiscoveryProvider()
  );
}
