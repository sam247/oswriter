import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { FirecrawlDiscoveryProvider } from "@/lib/research/providers/firecrawl";
import { Crawl4AiFitMarkdownCrawler } from "@/lib/research/providers/crawl4ai";
import { QueueWriteV2DiscoveryProvider } from "@/lib/research/providers/queuewrite-v2";
import { INTERNAL_RESEARCH_PROVIDER_OPTIONS, RESEARCH_PROVIDER_OPTIONS, ResearchProviderError, ResearchProviderRegistry, WorkspaceResearchProvider } from "@/lib/research/providers/registry";
import { runResearch } from "@/lib/research/research-engine";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { WorkspaceStore } from "@/lib/storage/storage";

describe("research provider architecture", () => {
  it("exposes product-safe provider labels", () => {
    assert.deepEqual(RESEARCH_PROVIDER_OPTIONS.map(({ id, label }) => ({ id, label })), [
      { id: "queuewrite", label: "QueueWrite Research" }
    ]);
    assert.deepEqual(INTERNAL_RESEARCH_PROVIDER_OPTIONS, [
      { id: "queuewrite_v2", label: "QueueWrite Research v2" },
      { id: "firecrawl", label: "Firecrawl" }
    ]);
    assert.equal(RESEARCH_PROVIDER_OPTIONS.some(({ id }) => id === "queuewrite_v2"), false);
  });

  it("configures QueueWrite Research v2 for fit markdown without advanced crawling", async () => {
    let endpoint = "";
    let request: RequestInit | undefined;
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      endpoint = String(url);
      request = init;
      return new Response(JSON.stringify({
        results: [{
          markdown: {
            fit_markdown: "# Technical guidance\n\nA detailed main-content paragraph with structured evidence.",
            raw_markdown: "Navigation\n\n# Technical guidance"
          },
          links: { internal: [{ href: "https://example.com/details" }], external: [] }
        }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    const crawler = new Crawl4AiFitMarkdownCrawler("http://crawl4ai.internal", "", fetcher, { costPerPageUsd: 0.002 });
    const result = await crawler.crawl("https://example.com/guide", { query: "technical guidance" });
    const body = JSON.parse(String(request?.body));
    const config = body.crawler_config.params;
    assert.equal(endpoint, "http://crawl4ai.internal/crawl");
    assert.match(result.markdown, /Technical guidance/);
    assert.equal(result.estimatedCostUsd, 0.002);
    assert.equal(config.markdown_generator.params.content_filter.type, "PruningContentFilter");
    assert.equal(config.markdown_generator.params.content_filter.params.threshold_type, "dynamic");
    assert.equal(config.remove_overlay_elements, true);
    assert.equal(config.remove_forms, true);
    assert.deepEqual(config.excluded_tags, ["nav", "footer", "header", "aside", "form"]);
    assert.equal(config.deep_crawl_strategy, undefined);
    assert.equal(config.session_id, undefined);
    assert.equal(body.browser_config.params.proxy_config, undefined);
  });

  it("enriches Exa results through Crawl4AI while preserving Exa fallback content", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.QUEUEWRITE_RESEARCH_API_KEY;
    process.env.QUEUEWRITE_RESEARCH_API_KEY = "exa-test";
    globalThis.fetch = (async () => new Response(JSON.stringify({
      requestId: "exa-request",
      results: [
        { title: "Crawled", url: "https://example.com/crawled", text: "Original Exa content" },
        { title: "Fallback", url: "https://example.com/fallback", text: "Preserved Exa fallback" }
      ]
    }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
    try {
      const crawler = {
        async crawl(url: string) {
          if (url.endsWith("fallback")) throw new Error("crawl failed");
          return { markdown: "# Main content\n\nClean technical evidence retained from the page.", durationMs: 25, estimatedCostUsd: 0.001 };
        }
      };
      const result = await new QueueWriteV2DiscoveryProvider(crawler).search("technical evidence", { numResults: 5 });
      assert.match(result.results[0]?.text ?? "", /Clean technical evidence/);
      assert.equal(result.results[1]?.text, "Preserved Exa fallback");
      assert.equal(result.usage?.provider, "queuewrite_v2");
      assert.equal(result.usage?.crawlSuccesses, 1);
      assert.equal(result.usage?.crawlFailures, 1);
      assert.equal(result.usage?.crawlDurationMs, 25);
      assert.equal(result.usage?.estimatedCostUsd, 0.001);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.QUEUEWRITE_RESEARCH_API_KEY;
      else process.env.QUEUEWRITE_RESEARCH_API_KEY = originalKey;
    }
  });

  it("records managed Exa and Crawl4AI cost and usage for v2", async () => {
    let calls = 0;
    const research = await runResearch("Technical Guidance", "article-v2", {
      async search() {
        calls += 1;
        return {
          results: [{
            title: `Official technical guidance ${calls}`,
            url: `https://example.gov/guidance/${calls}`,
            text: "Official technical guidance provides detailed requirements, implementation steps, evidence, tables, lists, and operational considerations for industry teams.",
            highlights: ["Detailed requirements and implementation evidence for industry teams are retained from the main content."]
          }],
          requestId: `exa-${calls}`,
          usage: {
            provider: "queuewrite_v2" as const,
            exaSearchRequests: 1,
            exaContentPages: 1,
            estimatedCostUsd: 0.002,
            crawlPages: 1,
            crawlSuccesses: 1,
            crawlFailures: 0,
            crawlDurationMs: 20
          }
        };
      }
    }, undefined, "industry_explainer", "queuewrite_v2");
    const exaCost = (research.estimatedExaSearchCostUsd ?? 0) + (research.estimatedExaContentCostUsd ?? 0);
    assert.equal(research.researchProvider, "queuewrite_v2");
    assert.equal(research.exaSearchRequests, calls);
    assert.ok((research.researchCostUsd ?? 0) > exaCost);
    assert.equal(research.providerUsage?.crawlPages, calls);
    assert.equal(research.providerUsage?.crawlSuccesses, calls);
    assert.equal(research.providerUsage?.crawlFailures, 0);
    assert.equal(research.providerUsage?.crawlDurationMs, calls * 20);
  });

  it("maps Firecrawl v2 search and main-content markdown to the shared search contract", async () => {
    let request: RequestInit | undefined;
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      request = init;
      return new Response(JSON.stringify({
        success: true,
        id: "fc_request_1",
        creditsUsed: 3,
        data: { web: [{ title: "Official guide", url: "https://example.com/guide", description: "A useful guide.", markdown: "# Guide\n\nThis is sufficiently detailed primary content for extraction and evidence collection." }] }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    const provider = new FirecrawlDiscoveryProvider("fc-test", fetcher);
    const result = await provider.search("useful guide", { numResults: 5, excludeDomains: ["noise.example"] });
    const body = JSON.parse(String(request?.body));
    assert.equal(result.requestId, "fc_request_1");
    assert.equal(result.results[0]?.text?.startsWith("# Guide"), true);
    assert.equal(result.usage?.provider, "firecrawl");
    assert.equal(body.scrapeOptions.onlyMainContent, true);
    assert.equal(body.scrapeOptions.onlyCleanContent, false);
  });

  it("falls back to discovery-only results when Firecrawl content scraping times out", async () => {
    let calls = 0;
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.scrapeOptions, undefined);
      return new Response(JSON.stringify({ success: true, data: { web: [{ title: "Result", url: "https://example.com", description: "Useful discovery result" }] } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    const result = await new FirecrawlDiscoveryProvider("fc-test", fetcher).search("test", { numResults: 5 });
    assert.equal(calls, 2);
    assert.equal(result.results.length, 1);
  });

  it("resolves the selected provider per stored workspace user preference", async () => {
    const store = new WorkspaceStore(new MemoryStorageAdapter());
    const preferences = await store.getWorkspacePreferences();
    await store.saveWorkspacePreferences({
      ...preferences,
      aiProvider: { ...preferences.aiProvider, researchProvider: "firecrawl", firecrawlApiKey: "fc-user-key", firecrawlKeyStatus: "configured" }
    });
    const registry = new ResearchProviderRegistry().register("firecrawl", (apiKey) => ({
      id: "firecrawl",
      label: "Firecrawl",
      async research(input) {
        assert.equal(apiKey, "fc-user-key");
        return { articleId: input.articleId, title: input.title, queries: [], sources: [], rejectedSources: [], usefulFacts: [], rejectedFacts: [], questionsFound: [], headingsFound: [], authorityScore: 0, relevanceScore: 0, confidence: 0, warnings: [], requestIds: [], durationMs: 1, researchProvider: "firecrawl", createdAt: new Date(0).toISOString() };
      }
    }));
    const result = await new WorkspaceResearchProvider(store, registry, true).research({ title: "Test", articleId: "article_1" });
    assert.equal(result.researchProvider, "firecrawl");
  });

  it("does not fall back to managed research when BYOK quota is exhausted", async () => {
    const store = new WorkspaceStore(new MemoryStorageAdapter());
    const preferences = await store.getWorkspacePreferences();
    await store.saveWorkspacePreferences({
      ...preferences,
      aiProvider: { ...preferences.aiProvider, researchProvider: "firecrawl", firecrawlApiKey: "fc-user-key", firecrawlKeyStatus: "configured" }
    });
    let managedCalls = 0;
    const registry = new ResearchProviderRegistry()
      .register("firecrawl", () => ({ id: "firecrawl", label: "Firecrawl", async research() { throw new Error("402 Insufficient credits"); } }))
      .register("queuewrite", () => ({ id: "queuewrite", label: "QueueWrite Research", async research() { managedCalls += 1; throw new Error("must not run"); } }));
    await assert.rejects(
      () => new WorkspaceResearchProvider(store, registry, true).research({ title: "Fallback", articleId: "article-1" }),
      (error) => error instanceof ResearchProviderError
        && error.provider === "firecrawl"
        && error.reason === "quota_exhausted"
        && error.message === "Quota exceeded (HTTP 402)"
    );
    assert.equal(managedCalls, 0);
  });

  it("routes saved Firecrawl preferences to QueueWrite Research while the internal flag is disabled", async () => {
    const store = new WorkspaceStore(new MemoryStorageAdapter());
    const preferences = await store.getWorkspacePreferences();
    await store.saveWorkspacePreferences({
      ...preferences,
      aiProvider: { ...preferences.aiProvider, researchProvider: "firecrawl", firecrawlApiKey: "internal-key" }
    });
    let firecrawlCalls = 0;
    const registry = new ResearchProviderRegistry()
      .register("firecrawl", () => ({ id: "firecrawl", label: "Firecrawl", async research() { firecrawlCalls += 1; throw new Error("must not run"); } }))
      .register("queuewrite", () => ({
        id: "queuewrite",
        label: "QueueWrite Research",
        async research(input) {
          return { articleId: input.articleId, title: input.title, queries: [], sources: [], rejectedSources: [], usefulFacts: [], rejectedFacts: [], questionsFound: [], headingsFound: [], authorityScore: 0, relevanceScore: 0, confidence: 0, warnings: [], requestIds: [], durationMs: 1, researchProvider: "queuewrite", createdAt: new Date(0).toISOString() };
        }
      }));
    const result = await new WorkspaceResearchProvider(store, registry, false).research({ title: "Public", articleId: "article-public" });
    assert.equal(result.researchProvider, "queuewrite");
    assert.equal(firecrawlCalls, 0);
  });

  it("redacts internal research configuration from public workspace state", async () => {
    const store = new WorkspaceStore(new MemoryStorageAdapter());
    const preferences = await store.getWorkspacePreferences();
    await store.saveWorkspacePreferences({
      ...preferences,
      aiProvider: { ...preferences.aiProvider, researchProvider: "firecrawl", firecrawlApiKey: "internal-key", firecrawlKeyStatus: "configured" }
    });

    const internal = await store.getWorkspacePreferences();
    const publicState = await store.getState();
    assert.equal(internal.aiProvider.researchProvider, "firecrawl");
    assert.equal(internal.aiProvider.firecrawlApiKey, "internal-key");
    assert.equal(publicState.preferences.aiProvider.researchProvider, "queuewrite");
    assert.equal(publicState.preferences.aiProvider.firecrawlApiKey, "");
    assert.equal(publicState.preferences.aiProvider.firecrawlKeyStatus, "not_configured");
  });

  it("cannot select QueueWrite Research v2 through workspace preferences", async () => {
    const store = new WorkspaceStore(new MemoryStorageAdapter());
    const preferences = await store.getWorkspacePreferences();
    await store.saveWorkspacePreferences({
      ...preferences,
      aiProvider: { ...preferences.aiProvider, researchProvider: "queuewrite_v2" }
    });
    let v2Calls = 0;
    const registry = new ResearchProviderRegistry()
      .register("queuewrite_v2", () => ({ id: "queuewrite_v2", label: "QueueWrite Research v2", async research() { v2Calls += 1; throw new Error("must not run"); } }))
      .register("queuewrite", () => ({
        id: "queuewrite",
        label: "QueueWrite Research",
        async research(input) {
          return { articleId: input.articleId, title: input.title, queries: [], sources: [], rejectedSources: [], usefulFacts: [], rejectedFacts: [], questionsFound: [], headingsFound: [], authorityScore: 0, relevanceScore: 0, confidence: 0, warnings: [], requestIds: [], durationMs: 1, researchProvider: "queuewrite", createdAt: new Date(0).toISOString() };
        }
      }));
    const result = await new WorkspaceResearchProvider(store, registry, true).research({ title: "Internal", articleId: "article-internal" });
    assert.equal(result.researchProvider, "queuewrite");
    assert.equal(v2Calls, 0);
  });

  it("returns a reviewable research pack instead of failing when every provider is unavailable", async () => {
    const store = new WorkspaceStore(new MemoryStorageAdapter());
    const registry = new ResearchProviderRegistry().register("queuewrite", () => ({
      id: "queuewrite", label: "QueueWrite Research", async research() { throw new Error("temporary outage"); }
    }));
    const result = await new WorkspaceResearchProvider(store, registry).research({ title: "Resilient", articleId: "article-1" });
    assert.equal(result.confidence, 0);
    assert.equal(result.sources.length, 0);
    assert.match(result.warnings[0] ?? "", /Generation continued/);
  });

  it("stores user keys separately and projects provider comparison metrics", async () => {
    const sql = await readFile(new URL("../db/migrations/0015_research_providers.sql", import.meta.url), "utf8");
    assert.match(sql, /create table if not exists user_provider_preferences/);
    assert.match(sql, /research_provider text/);
    assert.match(sql, /cost_per_accepted_source numeric/);
    assert.match(sql, /cost_per_evidence_item numeric/);
  });

  it("defines provider outcome telemetry for successful and failed research", async () => {
    const sql = await readFile(new URL("../db/migrations/0016_research_provider_outcomes.sql", import.meta.url), "utf8");
    assert.match(sql, /research_failed/);
    assert.match(sql, /requested_research_provider/);
    assert.match(sql, /actual_research_provider/);
    assert.match(sql, /fallback_used/);
    assert.match(sql, /fallback_reason/);
  });
});
