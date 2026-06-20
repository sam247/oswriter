import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { FirecrawlDiscoveryProvider } from "@/lib/research/providers/firecrawl";
import { RESEARCH_PROVIDER_OPTIONS, ResearchProviderRegistry, WorkspaceResearchProvider } from "@/lib/research/providers/registry";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { WorkspaceStore } from "@/lib/storage/storage";

describe("research provider architecture", () => {
  it("exposes product-safe provider labels", () => {
    assert.deepEqual(RESEARCH_PROVIDER_OPTIONS.map(({ id, label }) => ({ id, label })), [
      { id: "queuewrite", label: "QueueWrite Research" },
      { id: "firecrawl", label: "Firecrawl" }
    ]);
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
    const result = await new WorkspaceResearchProvider(store, registry).research({ title: "Test", articleId: "article_1" });
    assert.equal(result.researchProvider, "firecrawl");
  });

  it("stores user keys separately and projects provider comparison metrics", async () => {
    const sql = await readFile(new URL("../db/migrations/0015_research_providers.sql", import.meta.url), "utf8");
    assert.match(sql, /create table if not exists user_provider_preferences/);
    assert.match(sql, /research_provider text/);
    assert.match(sql, /cost_per_accepted_source numeric/);
    assert.match(sql, /cost_per_evidence_item numeric/);
  });
});
