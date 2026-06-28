import { TavilySearchAdapter } from "@/lib/research/providers/tavily";
import { ExaSearchAdapter } from "@/lib/research/exa";
import { SearchBackedResearchProvider } from "@/lib/research/providers/search-backed";
import type { SourceDiscoveryProvider } from "@/lib/research/providers/types";
import type { SearchResult } from "@/lib/types";

type SearchOptions = { numResults: number; includeDomains?: string[]; excludeDomains?: string[] };
type SearchResponse = { results: SearchResult[]; requestId?: string; usage?: Record<string, unknown> };

/**
 * The managed research discovery provider routes search queries through Tavily first,
 * then falls back to Exa silently. Both are internal implementation details.
 * Customers only ever see "Auto" — no provider names are surfaced.
 */
class ManagedResearchDiscoveryProvider implements SourceDiscoveryProvider {
  readonly providerId = "queuewrite" as const;

  private readonly tavily: TavilySearchAdapter | null;
  private readonly exa: ExaSearchAdapter;

  constructor() {
    const tavilyKey = process.env.QUEUEWRITE_TAVILY_API_KEY ?? process.env.TAVILY_API_KEY ?? "";
    this.tavily = tavilyKey ? new TavilySearchAdapter(tavilyKey) : null;
    this.exa = new ExaSearchAdapter({ providerId: "queuewrite" });
  }

  async search(query: string, options: SearchOptions): Promise<SearchResponse> {
    if (this.tavily) {
      try {
        const result = await this.tavily.search(query, options);
        // Re-stamp usage.provider as "queuewrite" so telemetry shows the managed label.
        return {
          ...result,
          usage: result.usage ? { ...result.usage, provider: "queuewrite" } : result.usage
        };
      } catch {
        // Fall through to Exa silently — the user only ever sees "Auto"
      }
    }
    return this.exa.search(query, options);
  }
}

export function createManagedResearchProvider() {
  return new SearchBackedResearchProvider("queuewrite", "QueueWrite Research", new ManagedResearchDiscoveryProvider());
}
