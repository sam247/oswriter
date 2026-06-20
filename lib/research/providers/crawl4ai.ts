import type { SourceCrawlerProvider } from "@/lib/research/providers/types";

export class Crawl4AiContentCrawler implements SourceCrawlerProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly token = process.env.CRAWL4AI_API_TOKEN ?? "",
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async crawl(url: string, _context: { query: string }) {
    const endpoint = `${this.baseUrl.replace(/\/+$/, "")}/md/${encodeURIComponent(url)}`;
    const res = await this.fetcher(endpoint, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "text/markdown, application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      }
    });
    if (!res.ok) throw new Error(`Managed content enrichment unavailable: ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) return { markdown: (await res.text()).trim() };
    const data = await res.json() as Record<string, unknown>;
    const markdown = extractMarkdown(data);
    return { markdown, links: extractLinks(data) };
  }
}

export interface Crawl4AiFitMarkdownOptions {
  timeoutMs?: number;
  costPerPageUsd?: number;
}

export interface Crawl4AiFitMarkdownResult {
  markdown: string;
  links?: string[];
  durationMs: number;
  estimatedCostUsd: number;
}

export interface Crawl4AiFitMarkdownClient {
  crawl(url: string, context: { query: string }): Promise<Crawl4AiFitMarkdownResult>;
}

// Initial v2 profile: single-page main-content extraction only. Advanced crawl,
// session, proxy, authentication and browser-hook features are intentionally omitted.
export class Crawl4AiFitMarkdownCrawler implements Crawl4AiFitMarkdownClient {
  private readonly timeoutMs: number;
  private readonly costPerPageUsd: number;

  constructor(
    private readonly baseUrl: string,
    private readonly token = process.env.QUEUEWRITE_V2_CRAWL4AI_API_TOKEN ?? "",
    private readonly fetcher: typeof fetch = fetch,
    options: Crawl4AiFitMarkdownOptions = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.costPerPageUsd = options.costPerPageUsd
      ?? finiteNumber(process.env.QUEUEWRITE_V2_CRAWL4AI_COST_PER_PAGE_USD);
  }

  async crawl(url: string, _context: { query: string }): Promise<Crawl4AiFitMarkdownResult> {
    if (!this.baseUrl.trim()) throw new Error("QueueWrite Research v2 Crawl4AI URL is not configured.");
    const started = Date.now();
    const res = await this.fetcher(`${this.baseUrl.replace(/\/+$/, "")}/crawl`, {
      method: "POST",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      },
      body: JSON.stringify({
        urls: [url],
        browser_config: {
          type: "BrowserConfig",
          params: { headless: true }
        },
        crawler_config: {
          type: "CrawlerRunConfig",
          params: {
            cache_mode: "BYPASS",
            stream: false,
            wait_until: "domcontentloaded",
            page_timeout: this.timeoutMs,
            word_count_threshold: 10,
            excluded_tags: ["nav", "footer", "header", "aside", "form"],
            excluded_selector: [
              "[class*='cookie']", "[id*='cookie']", "[class*='consent']", "[id*='consent']",
              "[class*='sidebar']", "[id*='sidebar']", "[class*='related']", "[id*='related']",
              "[class*='advert']", "[id*='advert']", ".ads", "[aria-label*='advertisement' i]"
            ].join(","),
            remove_overlay_elements: true,
            remove_forms: true,
            keep_data_attributes: false,
            markdown_generator: {
              type: "DefaultMarkdownGenerator",
              params: {
                content_filter: {
                  type: "PruningContentFilter",
                  params: {
                    threshold: 0.48,
                    threshold_type: "dynamic",
                    min_word_threshold: 5
                  }
                },
                options: {
                  type: "dict",
                  value: {
                    ignore_links: false,
                    ignore_images: true,
                    body_width: 0
                  }
                }
              }
            }
          }
        }
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`QueueWrite Research v2 content extraction unavailable: ${res.status} ${body.slice(0, 200)}`);
    }
    const data = await res.json() as Record<string, unknown>;
    const result = firstCrawlResult(data);
    const markdown = extractMarkdown(result);
    if (!markdown) throw new Error("QueueWrite Research v2 received no fit markdown from Crawl4AI.");
    return {
      markdown,
      links: extractLinks(result),
      durationMs: Date.now() - started,
      estimatedCostUsd: this.costPerPageUsd
    };
  }
}

function extractMarkdown(data: Record<string, unknown>) {
  const markdown = data.markdown;
  if (typeof markdown === "string") return markdown.trim();
  if (markdown && typeof markdown === "object") {
    const value = markdown as Record<string, unknown>;
    for (const key of ["fit_markdown", "raw_markdown", "markdown_with_citations"]) {
      if (typeof value[key] === "string") return String(value[key]).trim();
    }
  }
  if (typeof data.fit_markdown === "string") return data.fit_markdown.trim();
  return "";
}

function extractLinks(data: Record<string, unknown>) {
  if (!data.links || typeof data.links !== "object") return undefined;
  const links = data.links as Record<string, unknown>;
  return [...(Array.isArray(links.internal) ? links.internal : []), ...(Array.isArray(links.external) ? links.external : [])]
    .map((item) => item && typeof item === "object" && "href" in item ? String((item as { href: unknown }).href) : "")
    .filter(Boolean);
}

function firstCrawlResult(data: Record<string, unknown>) {
  if (Array.isArray(data.results) && data.results[0] && typeof data.results[0] === "object") {
    return data.results[0] as Record<string, unknown>;
  }
  if (data.result && typeof data.result === "object") return data.result as Record<string, unknown>;
  return data;
}

function finiteNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
