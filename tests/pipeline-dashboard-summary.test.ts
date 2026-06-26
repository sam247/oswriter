import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPipelineDashboardSummary } from "@/components/writer-app";
import { createPipeline } from "@/lib/defaults";
import type { QueueJob, ResearchPack, ResearchSource } from "@/lib/types";

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

describe("pipeline dashboard summary", () => {
  it("surfaces performance timings and research quality counts for the dashboard", () => {
    const pipeline = createPipeline().map((step) => {
      if (step.stage === "research") {
        return {
          ...step,
          status: "done" as const,
          startedAt: "2026-06-20T12:05:00.000Z",
          completedAt: "2026-06-20T12:05:14.000Z",
          durationMs: 14_000
        };
      }
      if (step.stage === "generation") {
        return {
          ...step,
          status: "done" as const,
          startedAt: "2026-06-20T12:05:14.000Z",
          completedAt: "2026-06-20T12:06:09.000Z",
          durationMs: 55_000
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
        return {
          ...step,
          status: "done" as const,
          startedAt: "2026-06-20T12:06:17.000Z",
          completedAt: "2026-06-20T12:06:17.000Z",
          durationMs: 0
        };
      }
      return step;
    });

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

    const research: ResearchPack = {
      articleId: "article-1",
      title: "Operational dashboard article",
      createdAt: "2026-06-20T12:05:14.000Z",
      queries: Array.from({ length: 6 }, (_, index) => `query-${index + 1}`),
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
      durationMs: 16_000
    };

    const summary = buildPipelineDashboardSummary(pipeline, null, job, research);

    assert.equal(summary.performance.activeProcessingMs, 77_000);
    assert.equal(summary.performance.queueWaitMs, 300_000);
    assert.equal(summary.performance.endToEndMs, 377_000);
    assert.equal(summary.research.acceptedSources, 12);
    assert.equal(summary.research.rejectedSources, 4);
    assert.equal(summary.research.queriesGenerated, 6);
    assert.deepEqual(summary.research.rejectedReasonSummary, [
      { label: "Outside accepted source set", count: 2 },
      { label: "Low relevance", count: 1 },
      { label: "Same project domain", count: 1 }
    ]);
  });
});
