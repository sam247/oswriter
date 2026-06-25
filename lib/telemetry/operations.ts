import { slugId } from "@/lib/text";
import type { ArticleDocument, ContentProfile, OperationalTelemetryDocument, OperationalTelemetryStatus, ResearchPack } from "@/lib/types";
import type { WorkspaceStore } from "@/lib/storage/storage";

interface BatchGenerationRunInput {
  projectId: string;
  batchRunId: string;
  articleCount: number;
  contentProfile?: ContentProfile;
  postGenerationAction?: string;
}

interface ResearchOperationInput {
  projectId: string;
  articleId: string;
  jobId: string;
  batchRunId?: string | null;
  title: string;
  research: ResearchPack;
  status?: OperationalTelemetryStatus;
  metadata?: Record<string, unknown>;
}

interface ResearchFailureInput {
  projectId: string;
  articleId: string;
  jobId: string;
  batchRunId?: string | null;
  title: string;
  provider: string;
  reason: string;
}

interface ArticleGenerationOperationInput {
  projectId: string;
  articleId: string;
  jobId: string;
  batchRunId?: string | null;
  article: ArticleDocument;
  title: string;
}

interface WebsiteImportOperationInput {
  projectId: string;
  sitemapUrl: string;
  status: OperationalTelemetryStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  pagesIndexed?: number;
  processedPages?: number;
  totalDiscoveredUrls?: number;
  metadata?: Record<string, unknown>;
}

export async function recordBatchGenerationRun(store: WorkspaceStore, input: BatchGenerationRunInput) {
  const now = new Date().toISOString();
  return safeSave(store, {
    id: slugId("op_batch"),
    projectId: input.projectId,
    articleId: null,
    jobId: null,
    batchRunId: input.batchRunId,
    type: "batch_generation_run",
    status: "queued",
    title: `${input.articleCount} article queue`,
    contentProfile: input.contentProfile ?? null,
    provider: null,
    attributionDate: dateOnly(now),
    attributionEligible: false,
    attributionUnits: 0,
    startedAt: now,
    completedAt: null,
    occurredAt: now,
    metrics: {
      articleCount: input.articleCount
    },
    costs: {},
    metadata: {
      postGenerationAction: input.postGenerationAction ?? "generate_only"
    },
    createdAt: now,
    updatedAt: now
  });
}

export async function recordResearchOperation(store: WorkspaceStore, input: ResearchOperationInput) {
  const occurredAt = input.research.createdAt;
  return safeSave(store, {
    id: slugId("op_research"),
    projectId: input.projectId,
    articleId: input.articleId,
    jobId: input.jobId,
    batchRunId: input.batchRunId ?? null,
    type: "research_operation",
    status: input.status ?? "completed",
    title: input.title,
    contentProfile: input.research.contentProfile ?? null,
    provider: input.research.providerUsage?.providerName ? String(input.research.providerUsage.providerName) : input.research.researchProvider ?? null,
    attributionDate: dateOnly(occurredAt),
    attributionEligible: false,
    attributionUnits: 0,
    startedAt: input.research.durationMs ? new Date(new Date(occurredAt).getTime() - input.research.durationMs).toISOString() : null,
    completedAt: occurredAt,
    occurredAt,
    metrics: {
      sourcesFound: input.research.sourcesFound ?? input.research.sources.length + input.research.rejectedSources.length,
      sourcesAccepted: input.research.sources.length,
      evidenceItemsUsed: input.research.evidenceItemsUsed ?? input.research.usefulFacts.length,
      durationMs: input.research.durationMs,
      researchDurationMs: input.research.durationMs
    },
    costs: {
      researchCostUsd: input.research.researchCostUsd ?? input.research.estimatedResearchCostUsd
    },
    metadata: {
      requestedResearchProvider: input.research.requestedResearchProvider ?? input.research.researchProvider ?? null,
      actualResearchProvider: input.research.actualResearchProvider ?? input.research.researchProvider ?? null,
      fallbackUsed: input.research.fallbackUsed ?? false,
      fallbackReason: input.research.fallbackReason ?? null,
      confidence: input.research.confidence,
      warnings: input.research.warnings,
      ...(input.metadata ?? {})
    },
    createdAt: occurredAt,
    updatedAt: occurredAt
  });
}

export async function recordResearchFailureOperation(store: WorkspaceStore, input: ResearchFailureInput) {
  const now = new Date().toISOString();
  return safeSave(store, {
    id: slugId("op_research"),
    projectId: input.projectId,
    articleId: input.articleId,
    jobId: input.jobId,
    batchRunId: input.batchRunId ?? null,
    type: "research_operation",
    status: "failed",
    title: input.title,
    contentProfile: null,
    provider: input.provider,
    attributionDate: dateOnly(now),
    attributionEligible: false,
    attributionUnits: 0,
    startedAt: null,
    completedAt: now,
    occurredAt: now,
    metrics: {},
    costs: {},
    metadata: {
      reason: input.reason
    },
    createdAt: now,
    updatedAt: now
  });
}

export async function recordArticleGenerationOperation(store: WorkspaceStore, input: ArticleGenerationOperationInput) {
  const costTelemetry = input.article.costTelemetry;
  const occurredAt = input.article.updatedAt;
  return safeSave(store, {
    id: slugId("op_article"),
    projectId: input.projectId,
    articleId: input.articleId,
    jobId: input.jobId,
    batchRunId: input.batchRunId ?? null,
    type: "article_generation",
    status: "completed",
    title: input.title,
    contentProfile: input.article.contentProfile ?? input.article.resolvedContentProfile ?? null,
    provider: costTelemetry?.generationProvider ?? null,
    attributionDate: dateOnly(occurredAt),
    attributionEligible: true,
    attributionUnits: 1,
    startedAt: input.article.timings?.started_at ?? null,
    completedAt: input.article.timings?.completed_at ?? occurredAt,
    occurredAt,
    metrics: {
      articleCount: 1,
      durationMs: costTelemetry?.totalDurationMs ?? nullToUndefined(input.article.timings?.completed_at && input.article.timings?.started_at
        ? new Date(input.article.timings.completed_at).getTime() - new Date(input.article.timings.started_at).getTime()
        : null),
      researchDurationMs: costTelemetry?.researchDurationMs ?? undefined,
      generationDurationMs: costTelemetry?.generationDurationMs ?? undefined,
      totalDurationMs: costTelemetry?.totalDurationMs ?? undefined
    },
    costs: {
      researchCostUsd: costTelemetry?.estimatedResearchCostUsd ?? undefined,
      generationCostUsd: costTelemetry?.estimatedGenerationCostUsd ?? undefined,
      totalCostUsd: costTelemetry?.estimatedTotalCostUsd ?? undefined
    },
    metadata: {
      articleStatus: input.article.status,
      reviewReasons: input.article.needsReviewReasons,
      wordCount: input.article.wordCount
    },
    createdAt: occurredAt,
    updatedAt: occurredAt
  });
}

export async function recordWebsiteImportOperation(store: WorkspaceStore, input: WebsiteImportOperationInput) {
  const occurredAt = input.completedAt ?? input.startedAt ?? new Date().toISOString();
  const pagesIndexed = input.pagesIndexed ?? 0;
  return safeSave(store, {
    id: slugId("op_import"),
    projectId: input.projectId,
    articleId: null,
    jobId: null,
    batchRunId: null,
    type: "website_intelligence_import",
    status: input.status,
    title: input.sitemapUrl,
    contentProfile: null,
    provider: null,
    attributionDate: dateOnly(occurredAt),
    attributionEligible: input.status === "completed",
    attributionUnits: input.status === "completed" ? websiteImportUnits(pagesIndexed, input.processedPages ?? 0) : 0,
    startedAt: input.startedAt ?? null,
    completedAt: input.completedAt ?? null,
    occurredAt,
    metrics: {
      pagesIndexed,
      processedPages: input.processedPages,
      totalDiscoveredUrls: input.totalDiscoveredUrls,
      durationMs: durationBetween(input.startedAt, input.completedAt)
    },
    costs: {},
    metadata: input.metadata ?? {},
    createdAt: occurredAt,
    updatedAt: occurredAt
  });
}

async function safeSave(store: WorkspaceStore, event: OperationalTelemetryDocument) {
  try {
    await store.saveOperationalTelemetry(event);
  } catch (error) {
    console.warn("operational telemetry persistence failed", {
      eventType: event.type,
      projectId: event.projectId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function durationBetween(startedAt?: string | null, completedAt?: string | null) {
  if (!startedAt || !completedAt) return undefined;
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined;
  return end - start;
}

function websiteImportUnits(pagesIndexed: number, processedPages: number) {
  const workload = Math.max(pagesIndexed, processedPages, 1);
  return Math.max(1, Number((workload / 25).toFixed(2)));
}

function nullToUndefined(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
