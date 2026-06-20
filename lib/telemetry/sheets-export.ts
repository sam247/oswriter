import { createSign } from "node:crypto";
import { calculateArticleScores } from "@/lib/scoring/article-scores";
import type { WorkspaceStore } from "@/lib/storage/storage";
import { buildDailySummaryRows, DAILY_SUMMARY_HEADERS, type DailySummaryContext } from "@/lib/telemetry/daily-summary";
import type { ArticleDocument, GenerationTelemetryDocument, ProjectDocument, ResearchPack, TelemetryExportStatusDocument } from "@/lib/types";
import { calculateTelemetryQuality } from "@/lib/telemetry/quality";

export const TELEMETRY_SPREADSHEET_ID = "1G0wbTt7xPoobZZncWZ1K-Y9EP2CjvmOrKP3WZvtAC3o";

export const TELEMETRY_SHEETS = {
  dailySummary: "Daily Summary",
  articleTelemetry: "Article Telemetry",
  providerTelemetry: "Provider Telemetry",
  anomalies: "Anomalies"
} as const;

export const PROVIDER_TELEMETRY_HEADERS = [
  "Benchmark Run",
  "Pair ID",
  "Date",
  "Article ID",
  "Article Title",
  "Content Profile",
  "Research Provider",
  "Research Cost",
  "Research Duration (seconds)",
  "Sources Found",
  "Sources Accepted",
  "Evidence Extracted",
  "Evidence Used",
  "Word Count",
  "Quality Score",
  "Research Score",
  "Evidence Score",
  "Generation Cost",
  "Total Cost",
  "Data Status"
] as const;

export interface SheetsAppendClient {
  appendRow(sheetName: string, row: TelemetryCell[]): Promise<void>;
  replaceRows?(sheetName: string, rows: TelemetryCell[][]): Promise<void>;
}

export type TelemetryCell = string | number;

interface ArticleTelemetryContext {
  telemetry: GenerationTelemetryDocument;
  article: ArticleDocument | null;
  project: ProjectDocument | null;
}

export async function exportArticleTelemetry(store: WorkspaceStore, telemetry: GenerationTelemetryDocument, client = createGoogleSheetsAppendClient()) {
  const [article, project, history] = await Promise.all([
    store.getArticle(telemetry.articleId, telemetry.projectId),
    store.getProject(telemetry.projectId),
    store.listGenerationTelemetry(telemetry.projectId)
  ]);
  const context = { telemetry, article, project };

  const articleExport = await exportOnce(store, client, {
    id: exportId("article", telemetry.projectId, telemetry.articleId),
    exportType: "article",
    projectId: telemetry.projectId,
    articleId: telemetry.articleId,
    exportKey: `${telemetry.projectId}:${telemetry.articleId}`,
    targetSheet: TELEMETRY_SHEETS.articleTelemetry,
    row: buildArticleTelemetryRow(context)
  });

  if (article) {
    await exportOnce(store, client, {
      id: exportId("article", telemetry.projectId, telemetry.articleId, "provider-telemetry"),
      exportType: "article",
      projectId: telemetry.projectId,
      articleId: telemetry.articleId,
      exportKey: `${telemetry.projectId}:${telemetry.articleId}:provider`,
      targetSheet: TELEMETRY_SHEETS.providerTelemetry,
      row: buildProviderTelemetryRow(telemetry, article, null)
    });
  }

  for (const anomaly of evaluateAnomalies(context, history)) {
    await exportOnce(store, client, {
      id: exportId("anomaly", telemetry.projectId, telemetry.articleId, anomaly.issueType),
      exportType: "anomaly",
      projectId: telemetry.projectId,
      articleId: telemetry.articleId,
      exportKey: `${telemetry.projectId}:${telemetry.articleId}:${slug(anomaly.issueType)}`,
      targetSheet: TELEMETRY_SHEETS.anomalies,
      row: [
        dateOnly(telemetry.updatedAt),
        telemetry.articleId,
        article?.title ?? telemetry.articleId,
        project?.name ?? telemetry.projectId,
        anomaly.issueType,
        anomaly.expectedValue,
        anomaly.actualValue
      ]
    });
  }

  if (articleExport.status === "exported") {
    await exportDailyTelemetrySummaries(store, client);
  }
}

export async function exportDailyTelemetrySummary(store: WorkspaceStore, date = previousUtcDate(), client = createGoogleSheetsAppendClient()) {
  await exportDailyTelemetrySummaries(store, client, date);
}

export async function exportDailyTelemetrySummaries(store: WorkspaceStore, client = createGoogleSheetsAppendClient(), requiredDate?: string) {
  const contexts = await loadDailySummaryContexts(store);
  const rows = buildDailySummaryRows(contexts);
  if (requiredDate && !rows.some((row) => row[0] === requiredDate)) {
    rows.push(buildDailySummaryRow(requiredDate, [], []));
    rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }

  if (client.replaceRows) {
    await client.replaceRows(TELEMETRY_SHEETS.dailySummary, [Array.from(DAILY_SUMMARY_HEADERS), ...rows]);
  } else {
    const row = rows.find((item) => item[0] === (requiredDate ?? previousUtcDate()));
    if (row) await client.appendRow(TELEMETRY_SHEETS.dailySummary, row);
  }

  const now = new Date().toISOString();
  for (const row of rows) {
    const date = String(row[0]);
    const existing = await store.getTelemetryExportStatus(exportId("daily_summary", date));
    await store.saveTelemetryExportStatus({
      id: exportId("daily_summary", date),
      organisationId: existing?.organisationId,
      exportType: "daily_summary",
      projectId: null,
      articleId: null,
      exportKey: date,
      targetSheet: TELEMETRY_SHEETS.dailySummary,
      status: "exported",
      attempts: (existing?.attempts ?? 0) + 1,
      lastError: null,
      exportedAt: now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
  }
  return rows;
}

export async function retryFailedTelemetryExports(store: WorkspaceStore, client = createGoogleSheetsAppendClient()) {
  const statuses = await store.listTelemetryExportStatuses();
  const retryable = statuses.filter((status) => status.status === "failed" || status.status === "pending");
  const articleKeys = new Map<string, { projectId: string; articleId: string }>();
  const dailySummaryDates = new Set<string>();

  for (const status of retryable) {
    if ((status.exportType === "article" || status.exportType === "anomaly") && status.projectId && status.articleId) {
      articleKeys.set(`${status.projectId}:${status.articleId}`, { projectId: status.projectId, articleId: status.articleId });
    }
    if (status.exportType === "daily_summary") {
      dailySummaryDates.add(status.exportKey);
    }
  }

  let attempted = 0;
  for (const item of articleKeys.values()) {
    const telemetry = await store.getGenerationTelemetry(item.articleId, item.projectId);
    if (!telemetry) continue;
    attempted += 1;
    await exportArticleTelemetry(store, telemetry, client);
  }

  for (const date of dailySummaryDates) {
    attempted += 1;
    await exportDailyTelemetrySummary(store, date, client);
  }

  const nextStatuses = await store.listTelemetryExportStatuses();
  return {
    candidates: retryable.length,
    attempted,
    exported: nextStatuses.filter((status) => status.status === "exported").length,
    failed: nextStatuses.filter((status) => status.status === "failed").length,
    pending: nextStatuses.filter((status) => status.status === "pending").length
  };
}

export function buildArticleTelemetryRow({ telemetry, article, project }: ArticleTelemetryContext): TelemetryCell[] {
  const quality = calculateTelemetryQuality(telemetry);
  return [
    dateOnly(telemetry.updatedAt),
    project?.name ?? telemetry.projectId,
    telemetry.articleId,
    article?.title ?? telemetry.articleId,
    telemetry.profileVersion ?? article?.profileSnapshot?.profileVersion ?? 0,
    telemetry.region ?? article?.profileSnapshot?.region ?? "",
    telemetry.industry ?? article?.profileSnapshot?.industry ?? "",
    telemetry.audience ?? article?.profileSnapshot?.audience ?? "",
    telemetry.targetWords,
    telemetry.actualWords,
    telemetry.targetAchievementPercent ?? article?.planningDiagnostics?.targetAchievementPercent ?? "",
    telemetry.plannedH2Count ?? article?.planningDiagnostics?.plannedH2Count ?? telemetry.plannedSections,
    telemetry.actualH2Count ?? article?.planningDiagnostics?.actualH2Count ?? telemetry.actualSections,
    telemetry.h2AchievementPercent ?? article?.planningDiagnostics?.h2AchievementPercent ?? "",
    telemetry.plannedH3Count ?? article?.planningDiagnostics?.plannedH3Count ?? "",
    telemetry.actualH3Count ?? article?.planningDiagnostics?.actualH3Count ?? "",
    telemetry.h3AchievementPercent ?? article?.planningDiagnostics?.h3AchievementPercent ?? "",
    telemetry.expectedDepth ?? article?.planningDiagnostics?.expectedDepth ?? "",
    telemetry.actualDepth ?? article?.planningDiagnostics?.actualDepth ?? "",
    telemetry.plannerOutcome ?? article?.planningDiagnostics?.plannerOutcome ?? "",
    telemetry.researchConceptCount ?? article?.planningDiagnostics?.researchConceptCount ?? "",
    (telemetry.researchConcepts ?? article?.planningDiagnostics?.researchConcepts ?? []).join(", "),
    telemetry.plannedBreadthRatio ?? article?.planningDiagnostics?.plannedBreadthRatio ?? "",
    telemetry.actualBreadthCoverage ?? article?.planningDiagnostics?.actualBreadthCoverage ?? "",
    telemetry.actualBreadthCoveragePercent ?? article?.planningDiagnostics?.actualBreadthCoveragePercent ?? "",
    telemetry.breadthStatus ?? article?.planningDiagnostics?.breadthStatus ?? "",
    telemetry.plannedSections,
    telemetry.actualSections,
    telemetry.qualityScore ?? quality.qualityScore,
    researchScore(article),
    telemetry.profileRelevanceScore ?? article?.profileRelevanceScore ?? article?.validation.profileRelevanceScore ?? "",
    telemetry.sourcesAccepted,
    telemetry.sourcesRejected,
    telemetry.findingsExtracted,
    telemetry.usefulFactsExtracted,
    telemetry.generationDurationMs ?? "",
    telemetry.finishReason ?? "",
    telemetry.reviewStatus,
    money(telemetry.estimatedResearchCostUsd),
    money(telemetry.estimatedGenerationCostUsd ?? telemetry.estimatedAiCostUsd),
    money(telemetry.totalCostUsd),
    telemetry.exaSearchRequests ?? telemetry.exaSearchCalls,
    telemetry.exaContentPages ?? telemetry.exaContentCalls,
    telemetry.generationProvider ?? "",
    telemetry.generationModel ?? telemetry.model ?? "",
    telemetry.inputTokens,
    telemetry.outputTokens,
    telemetry.totalTokens ?? telemetry.generationTokens,
    telemetry.researchDurationMs ?? "",
    telemetry.totalDurationMs ?? "",
    money(telemetry.costPerWord ?? 0),
    money(telemetry.costPerResearchConcept ?? 0),
    money(telemetry.costPerSource ?? 0),
    evidenceScore(article),
    telemetry.profileKey ?? article?.profileSnapshot?.profileKey ?? "",
    telemetry.generationCostPricingSource ?? "",
    telemetry.qualityBand ?? quality.qualityBand
  ];
}

export function buildProviderTelemetryRow(
  telemetry: GenerationTelemetryDocument,
  article: ArticleDocument,
  research: ResearchPack | null
): TelemetryCell[] {
  const scores = calculateArticleScores(article);
  const provider = research?.actualResearchProvider
    ?? research?.researchProvider
    ?? telemetry.actualResearchProvider
    ?? telemetry.requestedResearchProvider
    ?? metadataString(telemetry.metadata, "researchProvider")
    ?? "queuewrite";
  const legacyManagedCostMissing = provider === "queuewrite"
    && telemetry.estimatedResearchCostUsd === 0
    && (telemetry.exaSearchRequests ?? telemetry.exaSearchCalls) === 0;
  const generationCostMissing = !telemetry.generationCostPricingSource;
  const researchCost: TelemetryCell = legacyManagedCostMissing
    ? ""
    : money(research?.researchCostUsd ?? metadataNumber(telemetry.metadata, "researchCostUsd") ?? telemetry.estimatedResearchCostUsd);
  const generationCost: TelemetryCell = generationCostMissing
    ? ""
    : money(telemetry.estimatedGenerationCostUsd ?? telemetry.estimatedAiCostUsd);
  const totalCost: TelemetryCell = researchCost === "" || generationCost === ""
    ? ""
    : money(telemetry.totalCostUsd);
  const missing = [
    legacyManagedCostMissing ? "research cost" : null,
    generationCostMissing ? "generation cost" : null,
    (research?.contentProfile ?? metadataString(telemetry.metadata, "contentProfile")) ? null : "content profile"
  ].filter(Boolean);
  const date = dateOnly(telemetry.updatedAt);

  return [
    `Provider Benchmark ${date.slice(0, 7)}`,
    benchmarkPairId(article.title),
    date,
    article.id,
    article.title,
    research?.contentProfile ?? metadataString(telemetry.metadata, "contentProfile") ?? "Missing",
    researchProviderLabel(provider),
    researchCost,
    millisecondsToSeconds(telemetry.researchDurationMs ?? research?.durationMs),
    research?.sourcesFound ?? metadataNumber(telemetry.metadata, "sourcesFound") ?? telemetry.sourcesDiscovered,
    research?.sources.length ?? metadataNumber(telemetry.metadata, "sourcesAccepted") ?? telemetry.sourcesAccepted,
    research?.evidenceItemsExtracted ?? metadataNumber(telemetry.metadata, "evidenceItemsExtracted") ?? telemetry.findingsExtracted,
    research?.evidenceItemsUsed ?? metadataNumber(telemetry.metadata, "evidenceItemsUsed") ?? telemetry.usefulFactsExtracted,
    article.wordCount,
    scores.quality.score,
    scores.research.score,
    scores.evidence.score,
    generationCost,
    totalCost,
    missing.length ? `Missing ${missing.join(", ")} telemetry` : "Complete"
  ];
}

export function buildDailySummaryRow(date: string, records: GenerationTelemetryDocument[], articles: Array<ArticleDocument | null>): TelemetryCell[] {
  const contexts = records.map((telemetry, index): DailySummaryContext => ({ telemetry, article: articles[index] ?? null, project: null }));
  return buildDailySummaryRows(contexts).find((row) => row[0] === date) ?? emptyDailySummaryRow(date);
}

export function evaluateAnomalies(
  { telemetry, article }: ArticleTelemetryContext,
  projectHistory: GenerationTelemetryDocument[]
) {
  const anomalies: Array<{ issueType: string; expectedValue: string; actualValue: string }> = [];
  if (telemetry.targetWords > 0 && telemetry.actualWords < telemetry.targetWords * 0.8) {
    anomalies.push({
      issueType: "Under Target Output",
      expectedValue: `>= ${Math.round(telemetry.targetWords * 0.8)} words`,
      actualValue: `${telemetry.actualWords} words`
    });
  }

  const currentResearchScore = researchScore(article);
  if (isNumber(currentResearchScore) && currentResearchScore < 70) {
    anomalies.push({ issueType: "Low Research Score", expectedValue: ">= 70", actualValue: String(currentResearchScore) });
  }

  const telemetryQuality = telemetry.qualityScore ?? calculateTelemetryQuality(telemetry).qualityScore;
  if (telemetryQuality < 70) {
    anomalies.push({ issueType: "Low Quality Score", expectedValue: ">= 70", actualValue: String(telemetryQuality) });
  }

  const costBaseline = rollingAverage(projectHistory, telemetry.articleId, (item) => item.totalCostUsd);
  if (costBaseline > 0 && telemetry.totalCostUsd > costBaseline * 2) {
    anomalies.push({
      issueType: "High Cost",
      expectedValue: `<= ${money(costBaseline * 2)}`,
      actualValue: String(money(telemetry.totalCostUsd))
    });
  }

  const durationBaseline = rollingAverage(projectHistory, telemetry.articleId, (item) => item.generationDurationMs ?? null);
  if (durationBaseline > 0 && (telemetry.generationDurationMs ?? 0) > durationBaseline * 2) {
    anomalies.push({
      issueType: "Excessive Duration",
      expectedValue: `<= ${Math.round(durationBaseline * 2)} ms`,
      actualValue: `${telemetry.generationDurationMs} ms`
    });
  }

  if (telemetry.reviewStatus === "failed") {
    anomalies.push({ issueType: "Failed Generation", expectedValue: "generated or needs_review", actualValue: "failed" });
  }

  return anomalies;
}

export function createGoogleSheetsAppendClient(): SheetsAppendClient {
  return {
    async appendRow(sheetName, row) {
      const spreadsheetId = process.env.WRITER_OS_TELEMETRY_SHEET_ID ?? process.env.GOOGLE_TELEMETRY_SHEET_ID ?? TELEMETRY_SPREADSHEET_ID;
      const token = await getGoogleAccessToken();
      const range = encodeURIComponent(`${sheetName}!A:BD`);
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ values: [row] })
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Google Sheets append failed (${response.status}): ${body.slice(0, 500)}`);
      }
    },
    async replaceRows(sheetName, rows) {
      const spreadsheetId = telemetrySpreadsheetId();
      const token = await getGoogleAccessToken();
      await ensureSheetSize(spreadsheetId, token, sheetName, rows[0]?.length ?? 1);
      const lastColumn = columnLetter(rows[0]?.length ?? 1);
      const range = encodeURIComponent(`${sheetName}!A:${lastColumn}`);
      const clearResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: "{}"
      });
      if (!clearResponse.ok) {
        const body = await clearResponse.text().catch(() => "");
        throw new Error(`Google Sheets clear failed (${clearResponse.status}): ${body.slice(0, 500)}`);
      }
      const updateRange = encodeURIComponent(`${sheetName}!A1`);
      const updateResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${updateRange}?valueInputOption=USER_ENTERED`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ values: rows })
      });
      if (!updateResponse.ok) {
        const body = await updateResponse.text().catch(() => "");
        throw new Error(`Google Sheets update failed (${updateResponse.status}): ${body.slice(0, 500)}`);
      }
    }
  };
}

async function loadDailySummaryContexts(store: WorkspaceStore): Promise<DailySummaryContext[]> {
  const projects = await store.listProjects();
  const groups = await Promise.all(projects.map(async (project) => {
    const records = await store.listGenerationTelemetry(project.id);
    return Promise.all(records.map(async (telemetry) => ({
      telemetry,
      article: await store.getArticle(telemetry.articleId, telemetry.projectId),
      project
    })));
  }));
  return groups.flat();
}

async function ensureSheetSize(spreadsheetId: string, token: string, sheetName: string, columnCount: number) {
  const metadataResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!metadataResponse.ok) throw new Error(`Google Sheets metadata failed (${metadataResponse.status}).`);
  const metadata = await metadataResponse.json() as {
    sheets?: Array<{ properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }>;
  };
  const sheet = metadata.sheets?.find((item) => item.properties?.title === sheetName)?.properties;
  const requests: Array<Record<string, unknown>> = [];
  if (!sheet?.sheetId && sheet?.sheetId !== 0) {
    requests.push({ addSheet: { properties: { title: sheetName, gridProperties: { columnCount: Math.max(columnCount, 26), rowCount: 1000 } } } });
  } else if ((sheet.gridProperties?.columnCount ?? 0) < columnCount) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: sheet.sheetId, gridProperties: { columnCount } },
        fields: "gridProperties.columnCount"
      }
    });
  }
  if (!requests.length) return;
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ requests })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Sheets resize failed (${response.status}): ${body.slice(0, 500)}`);
  }
}

function telemetrySpreadsheetId() {
  return process.env.WRITER_OS_TELEMETRY_SHEET_ID ?? process.env.GOOGLE_TELEMETRY_SHEET_ID ?? TELEMETRY_SPREADSHEET_ID;
}

function columnLetter(columnCount: number) {
  let value = Math.max(1, columnCount);
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

async function exportOnce(
  store: WorkspaceStore,
  client: SheetsAppendClient,
  input: {
    id: string;
    exportType: TelemetryExportStatusDocument["exportType"];
    projectId: string | null;
    articleId: string | null;
    exportKey: string;
    targetSheet: string;
    row: TelemetryCell[];
  }
) {
  const existing = await store.getTelemetryExportStatus(input.id);
  if (existing?.status === "exported") return existing;
  const now = new Date().toISOString();
  const attempts = (existing?.attempts ?? 0) + 1;
  const base: TelemetryExportStatusDocument = {
    id: input.id,
    organisationId: existing?.organisationId,
    exportType: input.exportType,
    projectId: input.projectId,
    articleId: input.articleId,
    exportKey: input.exportKey,
    targetSheet: input.targetSheet,
    status: "pending",
    attempts,
    lastError: null,
    exportedAt: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  await store.saveTelemetryExportStatus(base);

  try {
    await client.appendRow(input.targetSheet, input.row);
    const exported: TelemetryExportStatusDocument = {
      ...base,
      status: "exported",
      exportedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await store.saveTelemetryExportStatus(exported);
    return exported;
  } catch (error) {
    const failed: TelemetryExportStatusDocument = {
      ...base,
      status: "failed",
      lastError: error instanceof Error ? error.message : String(error),
      updatedAt: new Date().toISOString()
    };
    await store.saveTelemetryExportStatus(failed);
    return failed;
  }
}

async function getGoogleAccessToken() {
  const directToken = process.env.GOOGLE_SHEETS_ACCESS_TOKEN;
  if (directToken) return directToken;

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    throw new Error("Google Sheets credentials are not configured. Set GOOGLE_SHEETS_ACCESS_TOKEN or GOOGLE_SERVICE_ACCOUNT_EMAIL plus GOOGLE_PRIVATE_KEY.");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const assertion = [
    base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64Url(JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSeconds,
      exp: nowSeconds + 3600
    }))
  ].join(".");
  const signature = createSign("RSA-SHA256").update(assertion).sign(privateKey);
  const jwt = `${assertion}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  const body = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description ?? body.error ?? `Google OAuth token request failed (${response.status})`);
  }
  return body.access_token;
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function researchScore(article: ArticleDocument | null) {
  const score = article?.validation.sectionScores.research;
  return isNumber(score) ? score : "";
}

function evidenceScore(article: ArticleDocument | null) {
  return article ? calculateArticleScores(article).evidence.score : "";
}

function emptyDailySummaryRow(date: string): TelemetryCell[] {
  return [date, ...Array.from({ length: DAILY_SUMMARY_HEADERS.length - 1 }, () => 0)];
}

function rollingAverage(records: GenerationTelemetryDocument[], articleId: string, select: (record: GenerationTelemetryDocument) => number | null) {
  const values = records
    .filter((record) => record.articleId !== articleId)
    .map(select)
    .filter(isNumber)
    .filter((value) => value > 0)
    .slice(0, 20);
  return average(values);
}

function previousUtcDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function dateOnly(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function millisecondsToSeconds(value: number | null | undefined): TelemetryCell {
  return isNumber(value) ? Number((value / 1000).toFixed(3)) : "";
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  return typeof metadata[key] === "string" && metadata[key] ? String(metadata[key]) : null;
}

function metadataNumber(metadata: Record<string, unknown>, key: string) {
  return isNumber(metadata[key]) ? metadata[key] : null;
}

function benchmarkPairId(title: string) {
  return title
    .toLowerCase()
    .replace(/\b(applications|apps)\b/g, "app")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function researchProviderLabel(provider: string) {
  if (provider === "queuewrite") return "QueueWrite Research (Exa)";
  if (provider === "queuewrite_v2") return "QueueWrite Research v2";
  if (provider === "firecrawl") return "Firecrawl BYOK";
  return provider
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  return values.length ? sum(values) / values.length : 0;
}

function money(value: number) {
  return Number(value.toFixed(6));
}

function rounded(value: number) {
  return Number(value.toFixed(2));
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function exportId(...parts: string[]) {
  return parts.map(slug).join(":");
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item";
}
