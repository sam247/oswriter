import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ExaSearchAdapter } from "@/lib/research/exa";
import { QueueWriteExperimentalDiscoveryProvider } from "@/lib/research/providers/queuewrite-experimental";
import { RESEARCH_PROVIDER_OPTIONS, INTERNAL_RESEARCH_PROVIDER_OPTIONS, ResearchProviderError, ResearchProviderRegistry, WorkspaceResearchProvider } from "@/lib/research/providers/registry";
import { toPublicWorkspacePreferences } from "@/lib/research/providers/public";
import { TAVILY_COST_PRICING_SOURCE, TavilySearchAdapter, validateTavilyApiKey } from "@/lib/research/providers/tavily";
import { runResearch } from "@/lib/research/research-engine";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { WorkspaceStore } from "@/lib/storage/storage";
import type { ResearchProviderId } from "@/lib/types";

describe("research provider architecture", () => {
  it("exposes production and configured BYOK lanes while keeping Exa Deep internal", () => {
    assert.deepEqual(RESEARCH_PROVIDER_OPTIONS, [
      { id: "queuewrite", label: "QueueWrite Research", requiresApiKey: false },
      { id: "byok", label: "BYOK Experimental (Tavily)", requiresApiKey: true }
    ]);
    assert.deepEqual(INTERNAL_RESEARCH_PROVIDER_OPTIONS, [
      { id: "queuewrite_experimental", label: "QueueWrite Research Experimental" }
    ]);
  });

  it("keeps production Exa on its default search request", async () => {
    const originalKey = process.env.EXA_API_KEY;
    process.env.EXA_API_KEY = "exa-test";
    let body: Record<string, unknown> = {};
    try {
      const provider = new ExaSearchAdapter({}, async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return Response.json({ results: [] });
      });
      await provider.search("production query", { numResults: 5 });
      assert.equal(body.type, undefined);
      assert.equal((body.contents as Record<string, unknown>).context, undefined);
    } finally {
      restoreEnv("EXA_API_KEY", originalKey);
    }
  });

  it("keeps Exa Deep isolated in the internal experimental provider", async () => {
    const originalKey = process.env.EXA_API_KEY;
    process.env.EXA_API_KEY = "exa-test";
    let body: Record<string, unknown> = {};
    try {
      const provider = new QueueWriteExperimentalDiscoveryProvider(async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return Response.json({ requestId: "deep-1", costDollars: { total: 0.022 }, results: [] });
      });
      const result = await provider.search("experimental query", { numResults: 5 });
      assert.equal(body.type, "deep");
      assert.equal((body.contents as Record<string, unknown>).context, true);
      assert.equal(result.usage?.provider, "queuewrite_experimental");
      assert.equal(result.usage?.managedResearchCostUsd, 0.022);
    } finally {
      restoreEnv("EXA_API_KEY", originalKey);
    }
  });

  it("uses Tavily Search basic and prices actual reported credits", async () => {
    let endpoint = "";
    let auth = "";
    let body: Record<string, unknown> = {};
    const provider = new TavilySearchAdapter("tvly-user-key", async (url, init) => {
      endpoint = String(url);
      auth = String((init?.headers as Record<string, string>).Authorization);
      body = JSON.parse(String(init?.body));
      return Response.json({
        request_id: "tavily-1",
        usage: { credits: 1 },
        results: [{ title: "Official result", url: "https://example.gov/guide", content: "Detailed technical guidance and evidence." }]
      });
    });
    const result = await provider.search("technical guidance", { numResults: 5, excludeDomains: ["noise.example"] });
    assert.equal(endpoint, "https://api.tavily.com/search");
    assert.equal(auth, "Bearer tvly-user-key");
    assert.equal(body.search_depth, "basic");
    assert.equal(body.include_answer, false);
    assert.equal(body.include_raw_content, false);
    assert.equal(body.include_usage, true);
    assert.equal(result.usage?.creditsUsed, 1);
    assert.equal(result.usage?.providerCostKnown, true);
    assert.equal(result.usage?.estimatedCostUsd, 0.008);
    assert.equal(result.usage?.providerCostPricingSource, TAVILY_COST_PRICING_SOURCE);
    assert.equal(result.results[0]?.summary, "Detailed technical guidance and evidence.");
  });

  it("does not infer zero Tavily cost when credit usage is absent", async () => {
    const provider = new TavilySearchAdapter("tvly-user-key", async () => Response.json({ results: [] }));
    const result = await provider.search("technical guidance", { numResults: 5 });
    assert.equal(result.usage?.providerCostKnown, false);
    assert.equal("estimatedCostUsd" in (result.usage ?? {}), false);
  });

  it("validates Tavily keys without spending a search credit", async () => {
    let endpoint = "";
    const valid = await validateTavilyApiKey("tvly-user-key", async (url, init) => {
      endpoint = String(url);
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer tvly-user-key");
      return Response.json({ usage: 12, limit: 1000 });
    });
    assert.equal(valid, true);
    assert.equal(endpoint, "https://api.tavily.com/usage");
  });

  it("uses reported Deep Search cost without changing the shared research pipeline", async () => {
    let calls = 0;
    const research = await runResearch("Technical Guidance", "article-experimental", {
      async search() {
        calls += 1;
        return searchResponse(`deep-${calls}`, "queuewrite_experimental", { managedResearchCostUsd: 0.02 });
      }
    }, undefined, "industry_explainer", "queuewrite_experimental");
    assert.equal(research.researchCostUsd, calls * 0.02);
    assert.equal(research.providerUsage?.reportedResearchCostUsd, calls * 0.02);
  });

  it("routes a configured per-user BYOK key to Tavily with no managed fallback", async () => {
    const store = new WorkspaceStore(new MemoryStorageAdapter());
    const preferences = await store.getWorkspacePreferences();
    await store.saveWorkspacePreferences({
      ...preferences,
      aiProvider: {
        ...preferences.aiProvider,
        researchProvider: "byok",
        byokResearchProvider: "tavily",
        researchKeyEnabled: true,
        researchKeyStatus: "configured",
        researchApiKey: "tvly-user-key"
      }
    });
    let managedCalls = 0;
    const registry = new ResearchProviderRegistry()
      .register("queuewrite", () => ({ id: "queuewrite", label: "QueueWrite Research", async research() { managedCalls += 1; throw new Error("must not run"); } }))
      .register("byok", (apiKey) => ({
        id: "byok",
        label: "BYOK Experimental (Tavily)",
        async research(input) {
          assert.equal(apiKey, "tvly-user-key");
          return emptyPack(input.articleId, input.title, "byok");
        }
      }));
    const result = await new WorkspaceResearchProvider(store, registry).research({ title: "BYOK", articleId: "article-1" });
    assert.equal(result.researchProvider, "byok");
    assert.equal(result.fallbackUsed, false);
    assert.equal(managedCalls, 0);
  });

  it("keeps BYOK failures provider-specific", async () => {
    const store = await byokStore();
    const registry = new ResearchProviderRegistry().register("byok", () => ({
      id: "byok",
      label: "BYOK Experimental (Tavily)",
      async research() { throw new Error("Tavily research unavailable: 401 invalid key"); }
    }));
    await assert.rejects(
      () => new WorkspaceResearchProvider(store, registry).research({ title: "Failure", articleId: "article-2" }),
      (error) => error instanceof ResearchProviderError
        && error.provider === "byok"
        && error.reason === "authentication"
    );
  });

  it("never exposes a saved Tavily key", async () => {
    const store = await byokStore();
    const internal = await store.getWorkspacePreferences();
    const publicPreferences = toPublicWorkspacePreferences(internal);
    assert.equal(internal.aiProvider.researchApiKey, "tvly-user-key");
    assert.equal(publicPreferences.aiProvider.researchApiKey, "");
    assert.equal(publicPreferences.aiProvider.researchKeyStatus, "configured");
    assert.equal(publicPreferences.aiProvider.researchProvider, "byok");
  });

  it("returns a reviewable research pack when production research is unavailable", async () => {
    const store = new WorkspaceStore(new MemoryStorageAdapter());
    const registry = new ResearchProviderRegistry().register("queuewrite", () => ({
      id: "queuewrite",
      label: "QueueWrite Research",
      async research() { throw new Error("QueueWrite Research unavailable: 503"); }
    }));
    const result = await new WorkspaceResearchProvider(store, registry).research({ title: "Resilient", articleId: "article-3" });
    assert.equal(result.researchProvider, "queuewrite");
    assert.equal(result.fallbackUsed, true);
  });
});

async function byokStore() {
  const store = new WorkspaceStore(new MemoryStorageAdapter());
  const preferences = await store.getWorkspacePreferences();
  await store.saveWorkspacePreferences({
    ...preferences,
    aiProvider: {
      ...preferences.aiProvider,
      researchProvider: "byok",
      byokResearchProvider: "tavily",
      researchKeyEnabled: true,
      researchKeyStatus: "configured",
      researchApiKey: "tvly-user-key"
    }
  });
  return store;
}

function searchResponse(requestId: string, provider: ResearchProviderId, usage: Record<string, number>) {
  return {
    results: [{ title: "Official guidance", url: `https://example.gov/${requestId}`, text: "Official technical guidance with detailed requirements, evidence, lists, and implementation considerations." }],
    requestId,
    usage: { provider, exaSearchRequests: 1, exaContentPages: 1, ...usage }
  };
}

function emptyPack(articleId: string, title: string, researchProvider: "queuewrite" | "byok") {
  return { articleId, title, researchProvider, queries: [], sources: [], rejectedSources: [], usefulFacts: [], rejectedFacts: [], questionsFound: [], headingsFound: [], authorityScore: 0, relevanceScore: 0, confidence: 0, warnings: [], requestIds: [], durationMs: 1, createdAt: new Date(0).toISOString() };
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
