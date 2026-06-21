import type { SourceDiscoveryProvider } from "@/lib/research/providers/types";
import type { SearchResult } from "@/lib/types";

interface TavilySearchResult {
  title?: string;
  url: string;
  content?: string;
  raw_content?: string | null;
}

interface TavilySearchResponse {
  results?: TavilySearchResult[];
  request_id?: string;
  usage?: { credits?: number };
}

export const TAVILY_CREDIT_COST_USD = 0.008;
export const TAVILY_COST_PRICING_SOURCE = "tavily_credit_0.008_usd";

export class TavilySearchAdapter implements SourceDiscoveryProvider {
  readonly providerId = "byok" as const;

  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async search(query: string, options: { numResults: number; includeDomains?: string[]; excludeDomains?: string[] }) {
    if (!this.apiKey.trim()) throw new Error("Tavily API key is required.");
    const response = await this.fetcher("https://api.tavily.com/search", {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: Math.min(options.numResults, 20),
        include_answer: false,
        include_raw_content: false,
        include_usage: true,
        include_domains: options.includeDomains,
        exclude_domains: options.excludeDomains
      })
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Tavily research unavailable: ${response.status} ${body.slice(0, 200)}`);
    }
    const data = await response.json() as TavilySearchResponse;
    const creditsUsed = typeof data.usage?.credits === "number" ? data.usage.credits : null;
    const results: SearchResult[] = (data.results ?? []).map((result) => ({
      title: result.title ?? result.url,
      url: result.url,
      text: result.raw_content ?? undefined,
      summary: result.content,
      highlights: result.content ? [result.content] : undefined,
      requestId: data.request_id
    }));
    return {
      results,
      requestId: data.request_id,
      usage: {
        provider: "byok" as const,
        providerName: "Tavily",
        providerType: "BYOK" as const,
        providerCostKnown: creditsUsed !== null,
        ...(creditsUsed === null ? {} : {
          creditsUsed,
          estimatedCostUsd: creditsUsed * TAVILY_CREDIT_COST_USD,
          providerCostPricingSource: TAVILY_COST_PRICING_SOURCE
        })
      }
    };
  }
}

export async function validateTavilyApiKey(apiKey: string, fetcher: typeof fetch = fetch) {
  if (!apiKey.trim()) return false;
  const response = await fetcher("https://api.tavily.com/usage", {
    method: "GET",
    signal: AbortSignal.timeout(8_000),
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  return response.ok;
}
