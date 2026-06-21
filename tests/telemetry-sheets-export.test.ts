import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultProject } from "@/lib/defaults";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { WorkspaceStore } from "@/lib/storage/storage";
import { buildDailySummaryRows, DAILY_SUMMARY_HEADERS } from "@/lib/telemetry/daily-summary";
import { buildDailySummaryRow, evaluateAnomalies, exportArticleTelemetry, TELEMETRY_SHEETS, type SheetsAppendClient, type TelemetryCell } from "@/lib/telemetry/sheets-export";
import type { ArticleDocument, GenerationTelemetryDocument } from "@/lib/types";

class FakeSheetsClient implements SheetsAppendClient {
  rows: Array<{ sheetName: string; row: TelemetryCell[] }> = [];
  replacements: Array<{ sheetName: string; rows: TelemetryCell[][] }> = [];

  async appendRow(sheetName: string, row: TelemetryCell[]) {
    this.rows.push({ sheetName, row });
  }

  async replaceRows(sheetName: string, rows: TelemetryCell[][]) {
    this.replacements.push({ sheetName, rows });
  }
}

describe("telemetry Google Sheets export", () => {
  it("appends article telemetry and anomalies once", async () => {
    const store = new WorkspaceStore(new MemoryStorageAdapter());
    const project = createDefaultProject();
    await store.saveProject(project);
    const article = sampleArticle();
    const telemetry = sampleTelemetry({
      totalCostUsd: 0.2,
      generationDurationMs: 3000,
      actualResearchProvider: "queuewrite_experimental",
      metadata: {
        researchProvider: "queuewrite_experimental",
        contentProfile: "industry_explainer",
        sourcesFound: 6,
        sourcesAccepted: 1,
        evidenceItemsExtracted: 8,
        evidenceItemsUsed: 5,
        researchCostUsd: 0.03
      }
    });
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
    assert.equal(articleRow?.[41], 4);
    assert.equal(articleRow?.[42], 2);
    assert.equal(articleRow?.[43], "test-provider");
    assert.equal(articleRow?.[44], "test-model");
    assert.equal(articleRow?.[47], 1700);
    assert.equal(articleRow?.[48], 900);
    assert.equal(articleRow?.[49], 2100);
    assert.equal(articleRow?.[50], 0.000114);
    assert.equal(typeof articleRow?.[53], "number");
    assert.equal(articleRow?.[54], "utilities_procurement_teams");
    assert.equal(articleRow?.[55], "test-model_cache_miss_assumed");
    assert.equal(articleRow?.[56], "Good");
    const providerRow = client.rows.find((row) => row.sheetName === TELEMETRY_SHEETS.providerTelemetry)?.row;
    assert.equal(client.rows.filter((row) => row.sheetName === TELEMETRY_SHEETS.providerTelemetry).length, 1);
    assert.equal(providerRow?.[0], "Provider Benchmark 2026-06");
    assert.equal(providerRow?.[4], "Telemetry Article");
    assert.equal(providerRow?.[5], "industry_explainer");
    assert.equal(providerRow?.[6], "QueueWrite Research Experimental");
    assert.equal(providerRow?.[7], 0.03);
    assert.equal(providerRow?.[8], 0.9);
    assert.equal(providerRow?.[9], 6);
    assert.equal(providerRow?.[10], 1);
    assert.equal(providerRow?.[11], 8);
    assert.equal(providerRow?.[12], 5);
    assert.equal(providerRow?.[19], "Complete");
    assert.equal(providerRow?.[20], "Experimental");
    assert.equal(providerRow?.[21], "");
    assert.equal(providerRow?.[22], "");
    assert.equal(client.rows.filter((row) => row.sheetName === TELEMETRY_SHEETS.anomalies).length, 4);
    assert.equal(client.replacements.at(-1)?.sheetName, TELEMETRY_SHEETS.dailySummary);
    assert.deepEqual(client.replacements.at(-1)?.rows[0], Array.from(DAILY_SUMMARY_HEADERS));
    assert.equal((await store.getTelemetryExportStatus("article:default-project:article-telemetry"))?.status, "exported");
    assert.equal((await store.getTelemetryExportStatus("anomaly:default-project:article-telemetry:under-target-output"))?.status, "exported");
  });

  it("builds daily business summary rows from article telemetry", () => {
    const first = sampleTelemetry({ articleId: "a", actualWords: 800, totalCostUsd: 0.08, generationDurationMs: 1200, qualityScore: 80, qualityBand: "Good" });
    const second = sampleTelemetry({ articleId: "b", actualWords: 1200, totalCostUsd: 0.12, generationDurationMs: 1800, qualityScore: 90, qualityBand: "Excellent" });

    const row = buildDailySummaryRow("2026-06-17", [first, second], [
      sampleArticle({ id: "a", qualityScore: 80, researchScore: 72 }),
      sampleArticle({ id: "b", qualityScore: 90, researchScore: 88 })
    ]);

    assert.equal(row.length, DAILY_SUMMARY_HEADERS.length);
    assert.equal(row[0], "2026-06-17");
    assert.equal(row[1], 2);
    assert.equal(row[2], 0);
    assert.equal(row[3], 100);
    assert.equal(row[4], 1000);
    assert.equal(row[8], 70);
    assert.equal(row[16], 1.5);
    assert.equal(row[17], 0.9);
    assert.equal(row[18], 2.1);
    assert.equal(row[21], 0.2);
    assert.equal(row[22], 0.1);
    assert.equal(row[23], 0.1);
    assert.equal(row[28], "utilities: 2");
    assert.match(String(row[31]), /Telemetry Article/);
  });

  it("calculates daily trend deltas without spreadsheet formulas", () => {
    const rows = buildDailySummaryRows([
      { telemetry: sampleTelemetry({ articleId: "a", updatedAt: "2026-06-16T12:00:00.000Z", actualWords: 1000, totalCostUsd: 0.1 }), article: sampleArticle({ id: "a", wordCount: 1000 }), project: createDefaultProject() },
      { telemetry: sampleTelemetry({ articleId: "b", updatedAt: "2026-06-17T12:00:00.000Z", actualWords: 1200, totalCostUsd: 0.2 }), article: sampleArticle({ id: "b", wordCount: 1200 }), project: createDefaultProject() },
      { telemetry: sampleTelemetry({ articleId: "c", updatedAt: "2026-06-17T14:00:00.000Z", actualWords: 800, totalCostUsd: 0.2 }), article: sampleArticle({ id: "c", wordCount: 800 }), project: createDefaultProject() }
    ]);

    assert.equal(rows.length, 2);
    assert.equal(rows[1][34], 100);
    assert.equal(rows[1][35], 100);
    assert.equal(rows[1][48], 300);
    assert.equal(rows[1][49], 300);
  });

  it("detects initial operational anomaly thresholds", () => {
    const article = sampleArticle({ qualityScore: 62, researchScore: 55 });
    const telemetry = sampleTelemetry({ targetWords: 1000, actualWords: 700, totalCostUsd: 0.2, generationDurationMs: 3000, qualityScore: 62, qualityBand: "Weak" });
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
    generationProvider: "test-provider",
    model: "test-model",
    generationModel: "test-model",
    generationCostPricingSource: "test-model_cache_miss_assumed",
    qualityScore: 84,
    qualityBand: "Good",
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
    profileKey: "utilities_procurement_teams",
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
    totalTokens: 1700,
    researchTokens: 1200,
    generationTokens: 1700,
    estimatedAiCostUsd: 0.05,
    estimatedGenerationCostUsd: 0.05,
    exaSearchCalls: 4,
    exaContentCalls: 2,
    exaSearchRequests: 4,
    exaContentPages: 2,
    estimatedExaSearchCostUsd: 0.028,
    estimatedExaContentCostUsd: 0.002,
    estimatedResearchCostUsd: 0.03,
    totalCostUsd: 0.08,
    generationDurationMs: 1200,
    totalDurationMs: 2100,
    costPerWord: 0.000114,
    costPerResearchConcept: 0.01,
    costPerSource: 0.02,
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
      profileKey: "utilities_procurement_teams",
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
