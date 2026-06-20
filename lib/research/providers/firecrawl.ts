import type { SearchResult } from "@/lib/types";
import { SearchBackedResearchProvider } from "@/lib/research/providers/search-backed";
import type { SourceDiscoveryProvider } from "@/lib/research/providers/types";

interface FirecrawlWebResult {
  title?: string;
  description?: string;
  url: string;
  markdown?: string;
  metadata?: { title?: string; description?: string; sourceURL?: string; url?: string };
}

interface FirecrawlSearchResponse {
  success?: boolean;
  data?: { web?: FirecrawlWebResult[] };
  id?: string;
  warning?: string;
  creditsUsed?: number;
}

export class FirecrawlDiscoveryProvider implements SourceDiscoveryProvider {
  readonly providerId = "firecrawl" as const;

  constructor(private readonly apiKey: string, private readonly fetcher: typeof fetch = fetch) {}

  async search(query: string, options: { numResults: number; includeDomains?: string[]; excludeDomains?: string[] }) {
    if (!this.apiKey.trim()) throw new Error("Firecrawl API key is required.");
    const res = await this.fetcher("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey.trim()}` },
      body: JSON.stringify({
        query,
        limit: options.numResults,
        sources: ["web"],
        ...(options.includeDomains?.length ? { includeDomains: options.includeDomains } : {}),
        ...(options.excludeDomains?.length ? { excludeDomains: options.excludeDomains } : {}),
        ignoreInvalidURLs: true,
        timeout: 18_000,
        scrapeOptions: {
          formats: [{ type: "markdown" }],
          onlyMainContent: true,
          onlyCleanContent: true,
          removeBase64Images: true,
          blockAds: true
        }
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Firecrawl research unavailable: ${res.status} ${body.slice(0, 200)}`);
    }
    const data = await res.json() as FirecrawlSearchResponse;
    if (data.success === false) throw new Error(data.warning || "Firecrawl research unavailable.");
    const requestId = data.id;
    const results: SearchResult[] = (data.data?.web ?? []).map((item) => {
      const markdown = item.markdown?.trim();
      return {
        title: item.title ?? item.metadata?.title ?? item.url,
        url: item.url ?? item.metadata?.sourceURL ?? item.metadata?.url ?? "",
        summary: item.description ?? item.metadata?.description,
        text: markdown ? markdown.slice(0, 7000) : undefined,
        highlights: markdown ? markdownHighlights(markdown) : [],
        requestId
      };
    }).filter((item) => Boolean(item.url));
    const costPerCredit = Number(process.env.FIRECRAWL_COST_PER_CREDIT_USD ?? 0);
    return {
      results,
      requestId,
      usage: {
        provider: "firecrawl" as const,
        creditsUsed: data.creditsUsed ?? 0,
        estimatedCostUsd: Number.isFinite(costPerCredit) ? (data.creditsUsed ?? 0) * costPerCredit : 0
      }
    };
  }
}

export function createFirecrawlResearchProvider(apiKey: string) {
  return new SearchBackedResearchProvider("firecrawl", "Firecrawl", new FirecrawlDiscoveryProvider(apiKey));
}

function markdownHighlights(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\n{2,}/)
    .map((part) => part.replace(/^#+\s*/g, "").replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 50 && part.length <= 500)
    .slice(0, 4);
}
