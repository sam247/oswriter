import { ExaSearchAdapter } from "@/lib/research/exa";
import { SearchBackedResearchProvider } from "@/lib/research/providers/search-backed";
import type { SourceDiscoveryProvider } from "@/lib/research/providers/types";

class QueueWriteDiscoveryProvider extends ExaSearchAdapter implements SourceDiscoveryProvider {
  readonly providerId = "queuewrite" as const;
}

export function createQueueWriteResearchProvider() {
  return new SearchBackedResearchProvider("queuewrite", "QueueWrite Research", new QueueWriteDiscoveryProvider());
}
