import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ExaSearchAdapter } from "@/lib/research/exa";
import { QueueWriteExperimentalDiscoveryProvider } from "@/lib/research/providers/queuewrite-experimental";
import { INTERNAL_RESEARCH_PROVIDER_OPTIONS, RESEARCH_PROVIDER_OPTIONS, ResearchProviderError, ResearchProviderRegistry, WorkspaceResearchProvider } from "@/lib/research/providers/registry";
import { runResearch } from "@/lib/research/research-engine";

describe("research provider architecture", () => {
  it("exposes only QueueWrite Research to customers", () => {
    assert.deepEqual(RESEARCH_PROVIDER_OPTIONS, [
      { id: "queuewrite", label: "QueueWrite Research", requiresApiKey: false }
    ]);
    assert.deepEqual(INTERNAL_RESEARCH_PROVIDER_OPTIONS, [
      { id: "queuewrite_experimental", label: "QueueWrite Research Experimental" },
      { id: "byok", label: "BYOK Research (not configured)" }
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

  it("isolates Exa Deep Search in the experimental provider", async () => {
    const originalKey = process.env.EXA_API_KEY;
    process.env.EXA_API_KEY = "exa-test";
    let body: Record<string, unknown> = {};
    try {
      const provider = new QueueWriteExperimentalDiscoveryProvider(async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return Response.json({
          requestId: "deep-1",
          costDollars: { total: 0.022 },
          results: [{ title: "Deep result", url: "https://example.com/deep", text: "Detailed technical evidence." }]
        });
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

  it("uses reported Deep Search cost without changing the shared research pipeline", async () => {
    let calls = 0;
    const research = await runResearch("Technical Guidance", "article-experimental", {
      async search() {
        calls += 1;
        return {
          results: [{
            title: `Official guidance ${calls}`,
            url: `https://example.gov/guidance/${calls}`,
            text: "Official technical guidance with detailed requirements, evidence, lists, and implementation considerations."
          }],
          requestId: `deep-${calls}`,
          usage: {
            provider: "queuewrite_experimental" as const,
            exaSearchRequests: 1,
            exaContentPages: 1,
            managedResearchCostUsd: 0.02
          }
        };
      }
    }, undefined, "industry_explainer", "queuewrite_experimental");
    assert.equal(research.researchProvider, "queuewrite_experimental");
    assert.equal(research.researchCostUsd, calls * 0.02);
    assert.equal(research.providerUsage?.reportedResearchCostUsd, calls * 0.02);
  });

  it("keeps production routing fixed even when other lanes are registered", async () => {
    let experimentalCalls = 0;
    const registry = new ResearchProviderRegistry()
      .register("queuewrite", () => ({
        id: "queuewrite",
        label: "QueueWrite Research",
        async research(input) {
          return emptyPack(input.articleId, input.title, "queuewrite");
        }
      }))
      .register("queuewrite_experimental", () => ({
        id: "queuewrite_experimental",
        label: "QueueWrite Research Experimental",
        async research() {
          experimentalCalls += 1;
          throw new Error("must not run");
        }
      }));
    const result = await new WorkspaceResearchProvider(registry).research({ title: "Production", articleId: "article-1" });
    assert.equal(result.researchProvider, "queuewrite");
    assert.equal(experimentalCalls, 0);
  });

  it("keeps BYOK as an inactive extension point", async () => {
    await assert.rejects(
      () => new ResearchProviderRegistry().create("byok").research({ title: "Future", articleId: "article-2" }),
      (error) => error instanceof ResearchProviderError
        && error.provider === "byok"
        && error.message === "BYOK Research is not configured."
    );
  });

  it("returns a reviewable research pack when production research is unavailable", async () => {
    const registry = new ResearchProviderRegistry().register("queuewrite", () => ({
      id: "queuewrite",
      label: "QueueWrite Research",
      async research() { throw new Error("QueueWrite Research unavailable: 503"); }
    }));
    const result = await new WorkspaceResearchProvider(registry).research({ title: "Resilient", articleId: "article-3" });
    assert.equal(result.researchProvider, "queuewrite");
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.fallbackReason, "provider_unavailable");
  });
});

function emptyPack(articleId: string, title: string, researchProvider: "queuewrite") {
  return {
    articleId,
    title,
    researchProvider,
    queries: [],
    sources: [],
    rejectedSources: [],
    usefulFacts: [],
    rejectedFacts: [],
    questionsFound: [],
    headingsFound: [],
    authorityScore: 0,
    relevanceScore: 0,
    confidence: 0,
    warnings: [],
    requestIds: [],
    durationMs: 1,
    createdAt: new Date(0).toISOString()
  };
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
