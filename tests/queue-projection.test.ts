import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { projectQueueCost } from "@/lib/queue/projection";
import { createDefaultProjectProfile } from "@/lib/project/profile";
import type { GenerationTelemetryDocument } from "@/lib/types";

describe("queue cost projection", () => {
  it("uses the v1 defaults when telemetry is unavailable", () => {
    const projection = projectQueueCost({
      articleCount: 4,
      profile: createDefaultProjectProfile(3_120),
      fallbackTargetWords: 1_400,
      generationModel: "deepseek-v4-flash",
      generationProvider: "openai-compatible"
    });

    assert.equal(projection.estimatedWords, 12_480);
    assert.equal(projection.estimatedResearchCostUsd, 0.288);
    assert.equal(projection.estimatedRuntimeMs, 360_000);
    assert.ok(projection.estimatedGenerationCostUsd > 0);
    assert.ok(Math.abs(projection.estimatedTotalCostUsd - projection.estimatedResearchCostUsd - projection.estimatedGenerationCostUsd) < 0.000001);
  });

  it("scales matching recent telemetry to the current target words", () => {
    const telemetry = [telemetryRecord({
      inputTokens: 6_000,
      outputTokens: 2_000,
      actualWords: 1_000,
      exaSearchRequests: 8,
      exaContentPages: 40,
      totalDurationMs: 120_000
    })];
    const projection = projectQueueCost({
      articleCount: 2,
      profile: createDefaultProjectProfile(1_500),
      fallbackTargetWords: 1_400,
      telemetry,
      generationModel: "deepseek-v4-flash",
      generationProvider: "openai-compatible"
    });

    assert.equal(projection.estimatedWords, 3_000);
    assert.equal(projection.estimatedResearchCostUsd, 0.192);
    assert.equal(projection.estimatedRuntimeMs, 240_000);
  });
});

function telemetryRecord(overrides: Partial<GenerationTelemetryDocument>): GenerationTelemetryDocument {
  return {
    projectId: "default",
    articleId: "article-1",
    reviewStatus: "generated",
    profileVersion: 2,
    region: "global",
    industry: "general",
    audience: "general_audience",
    targetWords: 1_000,
    actualWords: 1_000,
    plannedSections: 4,
    actualSections: 4,
    sourcesDiscovered: 20,
    sourcesAccepted: 10,
    sourcesRejected: 10,
    findingsExtracted: 10,
    usefulFactsExtracted: 8,
    citationsGenerated: 5,
    inputTokens: 4_500,
    outputTokens: 1_333,
    researchTokens: 0,
    generationTokens: 5_833,
    estimatedAiCostUsd: 0,
    exaSearchCalls: 6,
    exaContentCalls: 30,
    estimatedResearchCostUsd: 0,
    totalCostUsd: 0,
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}
