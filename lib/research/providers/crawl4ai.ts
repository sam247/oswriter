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
