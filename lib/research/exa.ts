import type { SearchAdapter, SearchResult } from "@/lib/types";

interface ExaSearchAdapterOptions {
  searchType?: "deep";
  providerId?: "queuewrite" | "queuewrite_experimental";
}

interface ExaResult {
  title?: string;
  url: string;
  text?: string;
  summary?: string;
  highlights?: string[];
}

export class ExaSearchAdapter implements SearchAdapter {
  private readonly apiKey = process.env.QUEUEWRITE_RESEARCH_API_KEY ?? process.env.EXA_API_KEY;

  constructor(
    private readonly options: ExaSearchAdapterOptions = {},
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async search(query: string, options: { numResults: number; includeDomains?: string[]; excludeDomains?: string[] }) {
    if (!this.apiKey) throw new Error("QueueWrite Research is not configured.");

    const res = await this.fetcher("https://api.exa.ai/search", {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey
      },
      body: JSON.stringify({
        query,
        ...(this.options.searchType ? { type: this.options.searchType } : {}),
        numResults: options.numResults,
        includeDomains: options.includeDomains,
        excludeDomains: options.excludeDomains,
        contents: {
          text: { maxCharacters: 2500 },
          highlights: { numSentences: 3 },
          summary: true,
          ...(this.options.searchType === "deep" ? { context: true } : {})
        }
      })
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`QueueWrite Research unavailable: ${res.status} ${body.slice(0, 200)}`);
    }

    const data = await res.json() as { results?: ExaResult[]; requestId?: string; costDollars?: { total?: number } };
    const results: SearchResult[] = (data.results ?? []).map((item) => ({
      title: item.title ?? item.url,
      url: item.url,
      text: item.text,
      summary: item.summary,
      highlights: item.highlights,
      requestId: data.requestId
    }));
    return {
      results,
      requestId: data.requestId,
      usage: {
        provider: this.options.providerId,
        exaSearchRequests: 1,
        exaContentPages: results.filter((result) => result.text || result.summary || (result.highlights?.length ?? 0) > 0).length,
        ...(this.options.searchType === "deep" && Number.isFinite(data.costDollars?.total)
          ? { managedResearchCostUsd: Number(data.costDollars?.total) }
          : {})
      }
    };
  }
}
