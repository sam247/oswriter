import { ExaSearchAdapter } from "@/lib/research/exa";
import { SearchBackedResearchProvider } from "@/lib/research/providers/search-backed";
import type { SourceCrawlerProvider, SourceDiscoveryProvider } from "@/lib/research/providers/types";
import { Crawl4AiContentCrawler } from "@/lib/research/providers/crawl4ai";

class QueueWriteDiscoveryProvider extends ExaSearchAdapter implements SourceDiscoveryProvider {
  readonly providerId = "queuewrite" as const;

  constructor(private readonly contentCrawler?: SourceCrawlerProvider) {
    super();
  }

  override async search(query: string, options: Parameters<ExaSearchAdapter["search"]>[1]) {
    const response = await super.search(query, options);
    if (!this.contentCrawler) return response;
    const enhanced = await Promise.all(response.results.map(async (result, index) => {
      if (index >= 2) return result;
      try {
        const crawled = await this.contentCrawler!.crawl(result.url, { query });
        return crawled.markdown ? { ...result, text: crawled.markdown.slice(0, 7000) } : result;
      } catch {
        return result;
      }
    }));
    return { ...response, results: enhanced };
  }
}

// Reserved for managed-only page cleanup, domain mapping and deep/adaptive crawling.
// It is deliberately absent from the public provider registry and UI.
export interface QueueWriteResearchEnhancements {
  contentCrawler?: SourceCrawlerProvider;
  enableDomainMapping?: boolean;
  enableDeepCrawling?: boolean;
  enableAdaptiveCrawling?: boolean;
}

export function createQueueWriteResearchProvider(_enhancements: QueueWriteResearchEnhancements = {}) {
  const configuredCrawler = _enhancements.contentCrawler
    ?? (process.env.CRAWL4AI_BASE_URL ? new Crawl4AiContentCrawler(process.env.CRAWL4AI_BASE_URL) : undefined);
  return new SearchBackedResearchProvider("queuewrite", "QueueWrite Research", new QueueWriteDiscoveryProvider(configuredCrawler));
}
