import { ExaSearchAdapter } from "@/lib/research/exa";
import { Crawl4AiFitMarkdownCrawler, type Crawl4AiFitMarkdownClient } from "@/lib/research/providers/crawl4ai";
import { SearchBackedResearchProvider } from "@/lib/research/providers/search-backed";
import type { SourceDiscoveryProvider } from "@/lib/research/providers/types";

export class QueueWriteV2DiscoveryProvider extends ExaSearchAdapter implements SourceDiscoveryProvider {
  readonly providerId = "queuewrite_v2" as const;
  private readonly crawlCache = new Map<string, ReturnType<Crawl4AiFitMarkdownClient["crawl"]>>();

  constructor(
    private readonly crawler: Crawl4AiFitMarkdownClient,
    private readonly maxCrawlPagesPerQuery = 5
  ) {
    super();
  }

  override async search(query: string, options: Parameters<ExaSearchAdapter["search"]>[1]) {
    const response = await super.search(query, options);
    let crawlSuccesses = 0;
    let crawlFailures = 0;
    let crawlDurationMs = 0;
    let crawlCostUsd = 0;
    const enriched = await Promise.all(response.results.map(async (result, index) => {
      if (index >= this.maxCrawlPagesPerQuery) return result;
      const existing = this.crawlCache.get(result.url);
      const ownsCrawl = !existing;
      try {
        const request = existing ?? this.crawler.crawl(result.url, { query });
        if (!existing) this.crawlCache.set(result.url, request);
        const crawled = await request;
        if (ownsCrawl) {
          crawlSuccesses += 1;
          crawlDurationMs += crawled.durationMs;
          crawlCostUsd += crawled.estimatedCostUsd;
        }
        return {
          ...result,
          text: crawled.markdown.slice(0, 12_000),
          highlights: markdownHighlights(crawled.markdown)
        };
      } catch {
        if (ownsCrawl) crawlFailures += 1;
        return result;
      }
    }));

    return {
      ...response,
      results: enriched,
      usage: {
        ...response.usage,
        provider: "queuewrite_v2" as const,
        estimatedCostUsd: crawlCostUsd,
        crawlPages: crawlSuccesses + crawlFailures,
        crawlSuccesses,
        crawlFailures,
        crawlDurationMs
      }
    };
  }
}

export function createQueueWriteResearchV2Provider(
  crawler: Crawl4AiFitMarkdownClient = new Crawl4AiFitMarkdownCrawler(process.env.QUEUEWRITE_V2_CRAWL4AI_BASE_URL ?? "")
) {
  return new SearchBackedResearchProvider(
    "queuewrite_v2",
    "QueueWrite Research v2",
    new QueueWriteV2DiscoveryProvider(crawler)
  );
}

function markdownHighlights(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\n{2,}/)
    .map((part) => part.replace(/^#+\s*/g, "").replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 50 && part.length <= 700)
    .slice(0, 6);
}
