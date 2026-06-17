import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultProject } from "@/lib/defaults";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { WorkspaceStore } from "@/lib/storage/storage";
import { buildDailySummaryRow, evaluateAnomalies, exportArticleTelemetry, TELEMETRY_SHEETS, type SheetsAppendClient, type TelemetryCell } from "@/lib/telemetry/sheets-export";
import type { ArticleDocument, GenerationTelemetryDocument } from "@/lib/types";

class FakeSheetsClient implements SheetsAppendClient {
  rows: Array<{ sheetName: string; row: TelemetryCell[] }> = [];

  async appendRow(sheetName: string, row: TelemetryCell[]) {
    this.rows.push({ sheetName, row });
  }
}

describe("telemetry Google Sheets export", () => {
  it("appends article telemetry and anomalies once", async () => {
    const store = new WorkspaceStore(new MemoryStorageAdapter());
    const project = createDefaultProject();
    await store.saveProject(project);
    const article = sampleArticle();
    const telemetry = sampleTelemetry({ totalCostUsd: 0.2, generationDurationMs: 3000 });
    await store.saveArticle(article);
    await store.saveGenerationTelemetry(sampleTelemetry({ articleId: "baseline-1", totalCostUsd: 0.05, generationDurationMs: 1000 }));
    await store.saveGenerationTelemetry(sampleTelemetry({ articleId: "baseline-2", totalCostUsd: 0.05, generationDurationMs: 1000 }));
    await store.saveGenerationTelemetry(telemetry);

    const client = new FakeSheetsClient();
    await exportArticleTelemetry(store, telemetry, client);
    await exportArticleTelemetry(store, telemetry, client);

    assert.equal(client.rows.filter((row) => row.sheetName === TELEMETRY_SHEETS.articleTelemetry).length, 1);
    const articleRow = client.rows.find((row) => row.sheetName === TELEMETRY_SHEETS.articleTelemetry)?.row;
    assert.equal(articleRow?.[4], 1);
    assert.equal(articleRow?.[5], "united_kingdom");
    assert.equal(articleRow?.[6], "utilities");
    assert.equal(articleRow?.[7], "procurement_teams");
    assert.equal(articleRow?.[10], 70);
    assert.equal(articleRow?.[11], 6);
    assert.equal(articleRow?.[14], 8);
    assert.equal(articleRow?.[17], "deep");
    assert.equal(articleRow?.[19], "under_depth");
    assert.equal(articleRow?.[20], 8);
    assert.equal(articleRow?.[21], "Basic Authentication, API Keys, JWT");
    assert.equal(articleRow?.[22], 0.75);
    assert.equal(articleRow?.[23], 3);
    assert.equal(articleRow?.[24], 37.5);
    assert.equal(articleRow?.[25], "undercovered");
    assert.equal(articleRow?.[30], 74);
    assert.equal(client.rows.filter((row) => row.sheetName === TELEMETRY_SHEETS.anomalies).length, 5);
    assert.equal((await store.getTelemetryExportStatus("article:default-project:article-telemetry"))?.status, "exported");
    assert.equal((await store.getTelemetryExportStatus("anomaly:default-project:article-telemetry:under-target-output"))?.status, "exported");
  });

  it("builds daily business summary rows from article telemetry", () => {
    const first = sampleTelemetry({ articleId: "a", actualWords: 800, totalCostUsd: 0.08, generationDurationMs: 1200 });
    const second = sampleTelemetry({ articleId: "b", actualWords: 1200, totalCostUsd: 0.12, generationDurationMs: 1800 });

    const row = buildDailySummaryRow("2026-06-17", [first, second], [
      sampleArticle({ id: "a", qualityScore: 80, researchScore: 72 }),
      sampleArticle({ id: "b", qualityScore: 90, researchScore: 88 })
    ]);

    assert.deepEqual(row, [
      "2026-06-17",
      2,
      2000,
      1000,
      85,
      80,
      12,
      16,
      0.2,
      0.1,
      0.1,
      1500
    ]);
  });

  it("detects initial operational anomaly thresholds", () => {
    const article = sampleArticle({ qualityScore: 62, researchScore: 55 });
    const telemetry = sampleTelemetry({ targetWords: 1000, actualWords: 700, totalCostUsd: 0.2, generationDurationMs: 3000 });
    const anomalies = evaluateAnomalies({ telemetry, article, project: createDefaultProject() }, [
      sampleTelemetry({ articleId: "baseline-1", totalCostUsd: 0.05, generationDurationMs: 1000 }),
      sampleTelemetry({ articleId: "baseline-2", totalCostUsd: 0.05, generationDurationMs: 1000 }),
      telemetry
    ]);

    assert.deepEqual(anomalies.map((item) => item.issueType), [
      "Under Target Output",
      "Low Research Score",
      "Low Quality Score",
      "High Cost",
      "Excessive Duration"
    ]);
  });
});

function sampleTelemetry(overrides: Partial<GenerationTelemetryDocument> = {}): GenerationTelemetryDocument {
  const now = overrides.updatedAt ?? "2026-06-17T12:00:00.000Z";
  return {
    projectId: "default-project",
    articleId: "article-telemetry",
    jobId: "job-telemetry",
    createdByUserId: "user-default",
    model: "test-model",
    targetWords: 1000,
    actualWords: 700,
    plannedSections: 6,
    actualSections: 4,
    plannedH2Count: 6,
    plannedH3Count: 8,
    expectedDepth: "deep",
    actualH2Count: 4,
    actualH3Count: 3,
    actualDepth: "standard",
    h2AchievementPercent: 66.7,
    h3AchievementPercent: 37.5,
    targetAchievementPercent: 70,
    plannerOutcome: "under_depth",
    researchConceptCount: 8,
    researchConcepts: ["Basic Authentication", "API Keys", "JWT"],
    plannedBreadthRatio: 0.75,
    actualBreadthCoverage: 3,
    actualBreadthCoveragePercent: 37.5,
    breadthStatus: "undercovered",
    finishReason: "stop",
    reviewStatus: "generated",
    profileVersion: 1,
    region: "united_kingdom",
    industry: "utilities",
    audience: "procurement_teams",
    profileRelevanceScore: 74,
    regionAwarenessActive: true,
    industryAwarenessActive: true,
    audienceAwarenessActive: true,
    researchDurationMs: 900,
    sourcesDiscovered: 6,
    sourcesAccepted: 4,
    sourcesRejected: 2,
    findingsExtracted: 8,
    usefulFactsExtracted: 5,
    citationsGenerated: 4,
    inputTokens: 1000,
    outputTokens: 700,
    researchTokens: 1200,
    generationTokens: 1700,
    estimatedAiCostUsd: 0.05,
    exaSearchCalls: 6,
    exaContentCalls: 6,
    estimatedResearchCostUsd: 0.03,
    totalCostUsd: 0.08,
    generationDurationMs: 1200,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function sampleArticle(overrides: Partial<ArticleDocument> & { researchScore?: number } = {}): ArticleDocument {
  const researchScore = overrides.researchScore ?? 55;
  const { researchScore: _researchScore, ...articleOverrides } = overrides;
  return {
    id: "article-telemetry",
    projectId: "default-project",
    jobId: "job-telemetry",
    title: "Telemetry Article",
    status: "generated",
    markdown: "# Telemetry Article\n\nBody",
    createdAt: "2026-06-17T12:00:00.000Z",
    updatedAt: "2026-06-17T12:00:00.000Z",
    wordCount: 700,
    targetWords: 1000,
    profileSnapshot: {
      profileVersion: 1,
      region: "united_kingdom",
      regionLabel: "United Kingdom",
      industry: "utilities",
      industryLabel: "Utilities",
      audience: "procurement_teams",
      audienceLabel: "Procurement Teams",
      targetWords: 1000,
      regionAwarenessActive: true,
      industryAwarenessActive: true,
      audienceAwarenessActive: true
    },
    profileRelevanceScore: 74,
    qualityScore: 62,
    researchSummary: "Summary",
    validation: {
      pass: false,
      warnings: [],
      needsReviewReasons: [],
      qualityScore: overrides.qualityScore ?? 62,
      sectionScores: { research: researchScore },
      profileRelevanceScore: 74,
      faqScore: 70,
      seoScore: 70
    },
    pipeline: [],
    sources: [],
    needsReviewReasons: [],
    ...articleOverrides
  };
}
