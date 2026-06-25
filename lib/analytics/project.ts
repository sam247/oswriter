import type { ArticleDocument, QueueJob, ResearchPack } from "@/lib/types";
import { calculateArticleScores, type ArticleScores, type ScoreComponent, type ScoreProfileItem } from "@/lib/scoring/article-scores";
import { isCompletedArticleStatus, isApprovedStatus } from "@/lib/status";

export interface ArticleScoreDiagnostics {
  score: number;
  components: ScoreComponent[];
  profile: ScoreProfileItem[];
}

export interface ArticlePerformanceMetrics {
  article_id: string;
  job_id: string;
  title: string;
  status: string;
  words: number;
  sources: number;
  quality: number;
  research: number;
  evidence: number;
  score_diagnostics: {
    quality: ArticleScoreDiagnostics;
    research: ArticleScoreDiagnostics;
    evidence: ArticleScoreDiagnostics;
  };
  confidence: number | null;
  queued_at: string | null;
  started_at: string | null;
  generated_at: string | null;
  visible_at: string | null;
  visible_context: string | null;
  completed_at: string | null;
  started_by: string | null;
  worker_first_seen_at: string | null;
  worker_lease_requested_at: string | null;
  worker_lease_acquired_at: string | null;
  state_reconciled_at: string | null;
  queue_wait_ms: number | null;
  research_duration_ms: number | null;
  generation_duration_ms: number | null;
  validation_duration_ms: number | null;
  save_duration_ms: number | null;
  active_total_ms: number;
  end_to_end_ms: number | null;
  waiting_overhead_ms: number | null;
  visibility_delay_ms: number | null;
  queue_wait_breakdown: QueueWaitBreakdown;
}

export interface QueueWaitBreakdown {
  cron_delay_ms: number | null;
  queue_position_ms: number | null;
  worker_lease_ms: number | null;
  worker_availability_ms: number | null;
  state_sync_ms: number | null;
  other_ms: number | null;
}

export interface ProjectAnalytics {
  total_articles: number;
  total_words: number;
  total_sources: number;
  performance: {
    average_active_total_ms: number | null;
    average_end_to_end_ms: number | null;
    average_queue_wait_ms: number | null;
    average_waiting_overhead_ms: number | null;
    average_visibility_delay_ms: number | null;
  };
  throughput: {
    articles_per_hour: number | null;
    words_per_hour: number | null;
    sources_per_article: number | null;
  };
  reliability: {
    success_rate: number;
    failure_rate: number;
    retry_rate: number;
  };
  quality: {
    average_quality_score: number | null;
    average_research_score: number | null;
    average_evidence_score: number | null;
    average_confidence: number | null;
  };
  bottlenecks: {
    averages: Array<{ key: string; label: string; average_ms: number | null }>;
    ranked: Array<{ key: string; label: string; average_ms: number }>;
  };
  queue_wait_breakdown: {
    averages: Array<{ key: keyof QueueWaitBreakdown; label: string; average_ms: number | null; percent_of_queue_wait: number | null }>;
    ranked: Array<{ key: keyof QueueWaitBreakdown; label: string; average_ms: number; percent_of_queue_wait: number | null }>;
  };
  recent_articles: ArticlePerformanceMetrics[];
  missing_timestamps: Record<string, number>;
}

export function buildProjectAnalytics({
  articles,
  jobs,
  researchPacks = []
}: {
  articles: ArticleDocument[];
  jobs: QueueJob[];
  researchPacks?: ResearchPack[];
}): ProjectAnalytics {
  const completedArticles = articles
    .filter((article) => isCompletedArticleStatus(article.status))
    .sort((a, b) => completedAtForArticle(b, jobs).localeCompare(completedAtForArticle(a, jobs)));
  const researchByArticle = new Map(researchPacks.map((pack) => [pack.articleId, pack]));
  const baseMetrics = completedArticles.map((article) => {
    const job = jobs.find((item) => item.id === article.jobId || item.articleId === article.id) ?? null;
    return buildArticlePerformanceMetrics(article, job, researchByArticle.get(article.id) ?? null);
  });
  const metrics = withQueueWaitBreakdowns(baseMetrics);
  const recent = metrics.slice(0, 20);
  const bottleneckAverages = [
    { key: "queue_wait_ms", label: "Queue Wait", average_ms: averageMetric(recent, "queue_wait_ms") },
    { key: "research_duration_ms", label: "Research", average_ms: averageMetric(recent, "research_duration_ms") },
    { key: "generation_duration_ms", label: "Generation", average_ms: averageMetric(recent, "generation_duration_ms") },
    { key: "validation_duration_ms", label: "Validation", average_ms: averageMetric(recent, "validation_duration_ms") },
    { key: "save_duration_ms", label: "Save", average_ms: averageMetric(recent, "save_duration_ms") },
    { key: "visibility_delay_ms", label: "Visibility Delay", average_ms: averageMetric(recent, "visibility_delay_ms") }
  ];
  const successfulJobs = jobs.filter((job) => job.status === "generated" || job.status === "needs_review" || isApprovedStatus(job.status)).length;
  const failedJobs = jobs.filter((job) => job.status === "failed" || job.status === "research_failed").length;
  const completedJobs = successfulJobs + failedJobs;
  const throughputWindowMs = projectWindowMs(metrics);
  const queueBreakdownAverages = buildQueueBreakdownAverages(recent, averageMetric(recent, "queue_wait_ms"));

  return {
    total_articles: completedArticles.length,
    total_words: completedArticles.reduce((sum, article) => sum + article.wordCount, 0),
    total_sources: completedArticles.reduce((sum, article) => sum + article.sources.length, 0),
    performance: {
      average_active_total_ms: averageMetric(metrics, "active_total_ms"),
      average_end_to_end_ms: averageMetric(metrics, "end_to_end_ms"),
      average_queue_wait_ms: averageMetric(metrics, "queue_wait_ms"),
      average_waiting_overhead_ms: averageMetric(metrics, "waiting_overhead_ms"),
      average_visibility_delay_ms: averageMetric(metrics, "visibility_delay_ms")
    },
    throughput: {
      articles_per_hour: throughputWindowMs ? roundTo((metrics.length / throughputWindowMs) * 3_600_000, 2) : null,
      words_per_hour: throughputWindowMs ? roundTo((completedArticles.reduce((sum, article) => sum + article.wordCount, 0) / throughputWindowMs) * 3_600_000, 0) : null,
      sources_per_article: completedArticles.length ? roundTo(completedArticles.reduce((sum, article) => sum + article.sources.length, 0) / completedArticles.length, 2) : null
    },
    reliability: {
      success_rate: completedJobs ? roundTo((successfulJobs / completedJobs) * 100, 1) : 100,
      failure_rate: completedJobs ? roundTo((failedJobs / completedJobs) * 100, 1) : 0,
      retry_rate: jobs.length ? roundTo((jobs.filter((job) => job.attempts > 1).length / jobs.length) * 100, 1) : 0
    },
    quality: {
      average_quality_score: average(metrics.map((metric) => metric.quality)),
      average_research_score: average(metrics.map((metric) => metric.research)),
      average_evidence_score: average(metrics.map((metric) => metric.evidence)),
      average_confidence: average(metrics.map((metric) => metric.confidence))
    },
    bottlenecks: {
      averages: bottleneckAverages,
      ranked: bottleneckAverages
        .filter((item): item is { key: string; label: string; average_ms: number } => item.average_ms !== null)
        .sort((a, b) => b.average_ms - a.average_ms)
    },
    queue_wait_breakdown: {
      averages: queueBreakdownAverages,
      ranked: queueBreakdownAverages
        .filter((item): item is { key: keyof QueueWaitBreakdown; label: string; average_ms: number; percent_of_queue_wait: number | null } => item.average_ms !== null)
        .sort((a, b) => b.average_ms - a.average_ms)
    },
    recent_articles: recent,
    missing_timestamps: countMissingTimestamps(metrics)
  };
}

function buildArticlePerformanceMetrics(article: ArticleDocument, job: QueueJob | null, research: ResearchPack | null): ArticlePerformanceMetrics {
  const timings = { ...job?.timings, ...article.timings };
  const queuedAt = timings.queued_at ?? job?.createdAt ?? article.createdAt ?? null;
  const startedAt = timings.started_at ?? firstStageStartedAt(article) ?? null;
  const generatedAt = timings.generated_at ?? article.updatedAt ?? job?.updatedAt ?? null;
  const completedAt = timings.completed_at ?? generatedAt;
  const visibleAt = timings.visible_at ?? null;
  const visibleContext = timings.visible_context ?? null;
  const researchMs = durationFromTiming(timings.research_started_at, timings.research_completed_at) ?? stageDuration(article, "research");
  const generationMs = durationFromTiming(timings.generation_started_at, timings.generation_completed_at) ?? stageDuration(article, "generation");
  const validationMs = durationFromTiming(timings.validation_started_at, timings.validation_completed_at) ?? stageDuration(article, "validation");
  const saveMs = durationFromTiming(timings.save_started_at, timings.save_completed_at) ?? stageDuration(article, "save");
  const activeTotalMs = [researchMs, generationMs, validationMs, saveMs].reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const endToEndMs = durationFromTiming(queuedAt, completedAt);
  const visibilityDelayMs = visibleContext ? durationFromTiming(generatedAt, visibleAt) : null;
  const confidence = research?.confidence ?? numberFromMeta(article, "research", "confidence");
  const scores = calculateArticleScores(article, research);

  return {
    article_id: article.id,
    job_id: article.jobId,
    title: article.title,
    status: article.status,
    words: article.wordCount,
    sources: article.sources.length,
    quality: scores.quality.score,
    research: scores.research.score,
    evidence: scores.evidence.score,
    score_diagnostics: scoreDiagnostics(scores),
    confidence,
    queued_at: queuedAt,
    started_at: startedAt,
    generated_at: generatedAt,
    visible_at: visibleAt,
    visible_context: visibleContext,
    completed_at: completedAt,
    started_by: timings.started_by ?? null,
    worker_first_seen_at: timings.worker_first_seen_at ?? null,
    worker_lease_requested_at: timings.worker_lease_requested_at ?? null,
    worker_lease_acquired_at: timings.worker_lease_acquired_at ?? null,
    state_reconciled_at: timings.state_reconciled_at ?? null,
    queue_wait_ms: durationFromTiming(queuedAt, startedAt),
    research_duration_ms: researchMs,
    generation_duration_ms: generationMs,
    validation_duration_ms: validationMs,
    save_duration_ms: saveMs,
    active_total_ms: activeTotalMs,
    end_to_end_ms: endToEndMs,
    waiting_overhead_ms: endToEndMs !== null ? Math.max(0, endToEndMs - activeTotalMs) : null,
    visibility_delay_ms: visibilityDelayMs,
    queue_wait_breakdown: emptyQueueWaitBreakdown()
  };
}

function scoreDiagnostics(scores: ArticleScores): ArticlePerformanceMetrics["score_diagnostics"] {
  return {
    quality: {
      score: scores.quality.score,
      components: scores.quality.components,
      profile: scores.quality.profile
    },
    research: {
      score: scores.research.score,
      components: scores.research.components,
      profile: scores.research.profile
    },
    evidence: {
      score: scores.evidence.score,
      components: scores.evidence.components,
      profile: scores.evidence.profile
    }
  };
}

function withQueueWaitBreakdowns(metrics: ArticlePerformanceMetrics[]) {
  const byStarted = [...metrics].sort((a, b) => timestampMs(a.started_at) - timestampMs(b.started_at));
  const previousCompleted = new Map<string, ArticlePerformanceMetrics | null>();
  for (const metric of byStarted) {
    const started = timestampMs(metric.started_at);
    const previous = byStarted
      .filter((candidate) => candidate.article_id !== metric.article_id && timestampMs(candidate.completed_at) <= started)
      .sort((a, b) => timestampMs(b.completed_at) - timestampMs(a.completed_at))[0] ?? null;
    previousCompleted.set(metric.article_id, previous);
  }

  return metrics.map((metric) => {
    const breakdown = calculateQueueWaitBreakdown(metric, previousCompleted.get(metric.article_id) ?? null);
    return { ...metric, queue_wait_breakdown: breakdown };
  });
}

function calculateQueueWaitBreakdown(metric: ArticlePerformanceMetrics, previous: ArticlePerformanceMetrics | null): QueueWaitBreakdown {
  if (metric.queue_wait_ms === null || !metric.queued_at || !metric.started_at) return emptyQueueWaitBreakdown();
  const queued = timestampMs(metric.queued_at);
  const started = timestampMs(metric.started_at);
  const workerSeen = metric.worker_first_seen_at ? timestampMs(metric.worker_first_seen_at) : null;
  const leaseRequested = metric.worker_lease_requested_at ? timestampMs(metric.worker_lease_requested_at) : null;
  const leaseAcquired = metric.worker_lease_acquired_at ? timestampMs(metric.worker_lease_acquired_at) : null;
  const previousCompleted = previous?.completed_at ? timestampMs(previous.completed_at) : null;
  const queueEnd = previousCompleted !== null && previousCompleted > queued && previousCompleted < started ? previousCompleted : null;
  const cronEnd = metric.started_by === "worker" && workerSeen !== null && workerSeen > queued && workerSeen < started ? workerSeen : null;
  const workerLeaseStart = leaseRequested !== null && leaseRequested > queued && leaseRequested < started ? leaseRequested : null;
  const workerLeaseEnd = leaseAcquired !== null && workerLeaseStart !== null && leaseAcquired > workerLeaseStart && leaseAcquired < started ? leaseAcquired : null;

  const events = [
    { at: queued, type: "start" as const },
    ...(cronEnd ? [{ at: cronEnd, type: "cron" as const }] : []),
    ...(queueEnd ? [{ at: queueEnd, type: "queue" as const }] : []),
    ...(workerLeaseStart ? [{ at: workerLeaseStart, type: "lease-start" as const }] : []),
    ...(workerLeaseEnd ? [{ at: workerLeaseEnd, type: "lease-end" as const }] : []),
    { at: started, type: "started" as const }
  ].sort((a, b) => a.at - b.at);

  const breakdown = {
    cron_delay_ms: 0,
    queue_position_ms: 0,
    worker_lease_ms: 0,
    worker_availability_ms: 0,
    state_sync_ms: 0,
    other_ms: 0
  } satisfies QueueWaitBreakdown;

  for (let index = 0; index < events.length - 1; index += 1) {
    const from = events[index];
    const to = events[index + 1];
    const duration = clampDuration(to.at - from.at, metric.queue_wait_ms);
    if (duration <= 0) continue;
    if (queueEnd !== null && from.at < queueEnd) breakdown.queue_position_ms += duration;
    else if (cronEnd !== null && from.at < cronEnd) breakdown.cron_delay_ms += duration;
    else if (from.type === "lease-start") breakdown.worker_lease_ms += duration;
    else if (workerSeen !== null && from.at >= workerSeen) breakdown.worker_availability_ms += duration;
    else breakdown.other_ms += duration;
  }

  const allocated = (breakdown.cron_delay_ms ?? 0) + (breakdown.queue_position_ms ?? 0) + (breakdown.worker_lease_ms ?? 0) + (breakdown.worker_availability_ms ?? 0) + (breakdown.other_ms ?? 0);
  return {
    ...breakdown,
    other_ms: (breakdown.other_ms ?? 0) + Math.max(0, metric.queue_wait_ms - allocated)
  };
}

function completedAtForArticle(article: ArticleDocument, jobs: QueueJob[]) {
  const job = jobs.find((item) => item.id === article.jobId || item.articleId === article.id);
  return article.timings?.completed_at ?? job?.timings?.completed_at ?? article.updatedAt;
}

function firstStageStartedAt(article: ArticleDocument) {
  return article.pipeline.map((step) => step.startedAt).filter(Boolean).sort()[0] ?? null;
}

function stageDuration(article: ArticleDocument, stage: string) {
  return article.pipeline.find((step) => step.stage === stage)?.durationMs ?? null;
}

function numberFromMeta(article: ArticleDocument, stage: string, key: string) {
  const value = article.pipeline.find((step) => step.stage === stage)?.meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function durationFromTiming(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const duration = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(duration) ? Math.max(0, duration) : null;
}

function averageMetric(items: ArticlePerformanceMetrics[], key: keyof ArticlePerformanceMetrics) {
  return average(items.map((item) => item[key]).filter((value): value is number => typeof value === "number"));
}

function buildQueueBreakdownAverages(metrics: ArticlePerformanceMetrics[], averageQueueWaitMs: number | null) {
  const fields: Array<{ key: keyof QueueWaitBreakdown; label: string }> = [
    { key: "cron_delay_ms", label: "Cron Delay" },
    { key: "queue_position_ms", label: "Queue Position" },
    { key: "worker_lease_ms", label: "Worker Lease" },
    { key: "worker_availability_ms", label: "Worker Availability" },
    { key: "state_sync_ms", label: "State Sync" },
    { key: "other_ms", label: "Other" }
  ];
  return fields.map((field) => {
    const averageMs = average(metrics.map((metric) => metric.queue_wait_breakdown[field.key]));
    return {
      ...field,
      average_ms: averageMs,
      percent_of_queue_wait: averageMs !== null && averageQueueWaitMs ? roundTo((averageMs / averageQueueWaitMs) * 100, 1) : null
    };
  });
}

function emptyQueueWaitBreakdown(): QueueWaitBreakdown {
  return {
    cron_delay_ms: null,
    queue_position_ms: null,
    worker_lease_ms: null,
    worker_availability_ms: null,
    state_sync_ms: null,
    other_ms: null
  };
}

function average(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!valid.length) return null;
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function projectWindowMs(metrics: ArticlePerformanceMetrics[]) {
  const starts = metrics.map((metric) => metric.queued_at).filter((value): value is string => Boolean(value)).map((value) => new Date(value).getTime());
  const ends = metrics.map((metric) => metric.completed_at).filter((value): value is string => Boolean(value)).map((value) => new Date(value).getTime());
  if (!starts.length || !ends.length) return null;
  const duration = Math.max(...ends) - Math.min(...starts);
  return duration > 0 ? duration : null;
}

function timestampMs(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function clampDuration(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, value));
}

function countMissingTimestamps(metrics: ArticlePerformanceMetrics[]) {
  const keys: Array<keyof ArticlePerformanceMetrics> = ["queued_at", "started_at", "generated_at", "visible_at", "completed_at"];
  return Object.fromEntries(keys.map((key) => [key, metrics.filter((metric) => !metric[key]).length]));
}

function roundTo(value: number, decimals: number) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}
