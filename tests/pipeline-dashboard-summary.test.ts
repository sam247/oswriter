import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGenerationSummaryNarrative,
  buildPipelineDashboardSummary,
  buildPipelineDiagnosticEvents
} from "@/components/writer-app";
import { createPipeline } from "@/lib/defaults";
import type { ArticleDocument, QueueJob, ResearchPack, ResearchSource } from "@/lib/types";

function source(index: number, overrides: Partial<ResearchSource> = {}): ResearchSource {
  return {
    id: `source-${index}`,
    url: `https://example.com/source-${index}`,
    domain: "example.com",
    title: `Source ${index}`,
    highlights: [],
    authorityScore: 80,
    relevanceScore: 90,
    accepted: true,
    ...overrides
  };
}

function semanticGraph(conceptCount: number) {
  return {
    primaryEntity: null,
    secondaryEntities: [],
    relatedEntities: [],
    terminology: [],
    definitions: [],
    comparisons: [],
    risks: [],
    benefits: [],
    costs: [],
    timeBasedConcepts: [],
    misconceptions: [],
    diagnosticQuestions: [],
    conditionalScenarios: [],
    expectedFaqs: [],
    entityConfusion: [],
    searchIntentArchetypes: [],
    missingConcepts: [],
    generatedAt: "2026-06-20T12:05:14.000Z",
    conceptCount
  };
}

function buildFixturePipeline() {
  return createPipeline().map((step) => {
    if (step.stage === "research") {
      return {
        ...step,
        status: "done" as const,
        startedAt: "2026-06-20T12:05:00.000Z",
        completedAt: "2026-06-20T12:05:14.000Z",
        durationMs: 14_000,
        meta: {
          providerName: "Tavily",
          sourcesFound: 30,
          semanticIntelligence: semanticGraph(41)
        }
      };
    }
    if (step.stage === "outline") {
      return { ...step, status: "done" as const, durationMs: 2_000 };
    }
    if (step.stage === "generation") {
      return {
        ...step,
        status: "done" as const,
        startedAt: "2026-06-20T12:05:14.000Z",
        completedAt: "2026-06-20T12:06:09.000Z",
        durationMs: 55_000,
        meta: { words: 2485 }
      };
    }
    if (step.stage === "validation") {
      return {
        ...step,
        status: "done" as const,
        startedAt: "2026-06-20T12:06:09.000Z",
        completedAt: "2026-06-20T12:06:17.000Z",
        durationMs: 8_000
      };
    }
    if (step.stage === "save") {
      return { ...step, status: "done" as const, durationMs: 0 };
    }
    if (step.stage === "export") {
      return { ...step, status: "idle" as const };
    }
    return step;
  });
}

function buildFixtureResearch(): ResearchPack {
  return {
    articleId: "article-1",
    title: "Operational dashboard article",
    createdAt: "2026-06-20T12:05:14.000Z",
    queries: Array.from({ length: 7 }, (_, index) => `query-${index + 1}`),
    sources: Array.from({ length: 12 }, (_, index) => source(index + 1)),
    rejectedSources: [
      source(101, { accepted: false, rejectionReason: "Outside accepted source set for this research run." }),
      source(102, { accepted: false, rejectionReason: "Outside accepted source set for this research run." }),
      source(103, { accepted: false, rejectionReason: "Same project domain." }),
      source(104, { accepted: false, rejectionReason: "Low relevance." })
    ],
    usefulFacts: [],
    rejectedFacts: [],
    questionsFound: [],
    headingsFound: [],
    authorityScore: 93,
    relevanceScore: 89,
    confidence: 95,
    warnings: [],
    requestIds: [],
    durationMs: 16_000,
    sourcesFound: 30,
    semanticIntelligence: semanticGraph(41),
    actualResearchProvider: "queuewrite",
    providerUsage: { providerName: "Tavily" }
  };
}

describe("pipeline dashboard summary", () => {
  it("keeps research quality counts for pipeline sections", () => {
    const pipeline = buildFixturePipeline();
    const job: QueueJob = {
      id: "job-1",
      projectId: "default",
      articleId: "article-1",
      title: "Operational dashboard article",
      status: "generated",
      createdAt: "2026-06-20T12:00:00.000Z",
      updatedAt: "2026-06-20T12:06:17.000Z",
      attempts: 1,
      needsReviewReasons: [],
      pipeline
    };
    const research = buildFixtureResearch();
    const summary = buildPipelineDashboardSummary(pipeline, null, job, research);

    assert.equal(summary.research.acceptedSources, 12);
    assert.equal(summary.research.rejectedSources, 4);
    assert.equal(summary.research.queriesGenerated, 7);
    assert.deepEqual(summary.research.rejectedReasonSummary, [
      { label: "Outside accepted source set", count: 2 },
      { label: "Low relevance", count: 1 },
      { label: "Same project domain", count: 1 }
    ]);
  });

  it("builds product-level diagnostic events for the pipeline tab", () => {
    const pipeline = buildFixturePipeline();
    const research = buildFixtureResearch();
    const events = buildPipelineDiagnosticEvents(pipeline, null, research, null);

    assert.ok(events.includes("Using Tavily provider"));
    assert.ok(events.includes("Built semantic knowledge graph (41 concepts)"));
    assert.ok(events.includes("Generated outline"));
    assert.ok(events.includes("Generated article draft"));
    assert.ok(events.includes("Validation completed"));
    assert.ok(events.includes("Saved article"));
  });

  it("builds a natural-language generation summary", () => {
    const pipeline = buildFixturePipeline();
    const research = buildFixtureResearch();
    const article = {
      id: "article-1",
      projectId: "default",
      jobId: "job-1",
      title: "Operational dashboard article",
      status: "needs_review",
      markdown: "# Article",
      createdAt: "2026-06-20T12:06:17.000Z",
      updatedAt: "2026-06-20T12:06:17.000Z",
      wordCount: 2485,
      qualityScore: 80,
      researchSummary: "",
      validation: {
        pass: false,
        warnings: ["Add a stronger introduction."],
        needsReviewReasons: ["Add a stronger introduction."],
        qualityScore: 80,
        sectionScores: {},
        faqScore: 0,
        seoScore: 0
      },
      pipeline,
      sources: research.sources,
      needsReviewReasons: ["Add a stronger introduction."]
    } satisfies ArticleDocument;

    const summary = buildGenerationSummaryNarrative(pipeline, article, null, research);

    assert.match(summary ?? "", /searched 30 sources/);
    assert.match(summary ?? "", /accepted 12 authoritative references/);
    assert.match(summary ?? "", /rejected 4 lower-quality sources/);
    assert.match(summary ?? "", /semantic knowledge graph containing 41 concepts/);
    assert.match(summary ?? "", /generated a 2,485-word article/);
    assert.match(summary ?? "", /identified 1 validation recommendation/);
  });
});
