import type { ArticleDocument, QueueJob, ResearchPack } from "@/lib/types";

export interface ArticlePerformanceMetrics {
  article_id: string;
  job_id: string;
  title: string;
  status: string;
  words: number;
  sources: number;
  quality: number;
  authority: number;
  confidence: number | null;
  queued_at: string | null;
  started_at: string | null;
  generated_at: string | null;
  visible_at: string | null;
  completed_at: string | null;
  queue_wait_ms: number | null;
  research_duration_ms: number | null;
  generation_duration_ms: number | null;
  validation_duration_ms: number | null;
  save_duration_ms: number | null;
  active_total_ms: number;
  end_to_end_ms: number | null;
  waiting_overhead_ms: number | null;
  visibility_delay_ms: number | null;
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
    average_authority: number | null;
    average_confidence: number | null;
  };
  bottlenecks: {
    averages: Array<{ key: string; label: string; average_ms: number | null }>;
    ranked: Array<{ key: string; label: string; average_ms: number }>;
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
    .filter((article) => article.status === "generated" || article.status === "needs_review")
    .sort((a, b) => completedAtForArticle(b, jobs).localeCompare(completedAtForArticle(a, jobs)));
  const researchByArticle = new Map(researchPacks.map((pack) => [pack.articleId, pack]));
  const metrics = completedArticles.map((article) => {
    const job = jobs.find((item) => item.id === article.jobId || item.articleId === article.id) ?? null;
    return buildArticlePerformanceMetrics(article, job, researchByArticle.get(article.id) ?? null);
  });
  const recent = metrics.slice(0, 20);
  const bottleneckAverages = [
    { key: "queue_wait_ms", label: "Queue Wait", average_ms: averageMetric(recent, "queue_wait_ms") },
    { key: "research_duration_ms", label: "Research", average_ms: averageMetric(recent, "research_duration_ms") },
    { key: "generation_duration_ms", label: "Generation", average_ms: averageMetric(recent, "generation_duration_ms") },
    { key: "validation_duration_ms", label: "Validation", average_ms: averageMetric(recent, "validation_duration_ms") },
    { key: "save_duration_ms", label: "Save", average_ms: averageMetric(recent, "save_duration_ms") },
    { key: "visibility_delay_ms", label: "Visibility Delay", average_ms: averageMetric(recent, "visibility_delay_ms") }
  ];
  const successfulJobs = jobs.filter((job) => job.status === "generated" || job.status === "needs_review").length;
  const failedJobs = jobs.filter((job) => job.status === "failed").length;
  const completedJobs = successfulJobs + failedJobs;
  const throughputWindowMs = projectWindowMs(metrics);

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
      average_quality_score: average(completedArticles.map((article) => article.qualityScore)),
      average_authority: average(metrics.map((metric) => metric.authority)),
      average_confidence: average(metrics.map((metric) => metric.confidence))
    },
    bottlenecks: {
      averages: bottleneckAverages,
      ranked: bottleneckAverages
        .filter((item): item is { key: string; label: string; average_ms: number } => item.average_ms !== null)
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
  const researchMs = durationFromTiming(timings.research_started_at, timings.research_completed_at) ?? stageDuration(article, "research");
  const generationMs = durationFromTiming(timings.generation_started_at, timings.generation_completed_at) ?? stageDuration(article, "generation");
  const validationMs = durationFromTiming(timings.validation_started_at, timings.validation_completed_at) ?? stageDuration(article, "validation");
  const saveMs = durationFromTiming(timings.save_started_at, timings.save_completed_at) ?? stageDuration(article, "save");
  const activeTotalMs = [researchMs, generationMs, validationMs, saveMs].reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const endToEndMs = durationFromTiming(queuedAt, completedAt);
  const visibilityDelayMs = durationFromTiming(generatedAt, visibleAt);
  const confidence = research?.confidence ?? numberFromMeta(article, "research", "confidence");

  return {
    article_id: article.id,
    job_id: article.jobId,
    title: article.title,
    status: article.status,
    words: article.wordCount,
    sources: article.sources.length,
    quality: article.qualityScore,
    authority: average(article.sources.map((source) => source.authorityScore)) ?? 0,
    confidence,
    queued_at: queuedAt,
    started_at: startedAt,
    generated_at: generatedAt,
    visible_at: visibleAt,
    completed_at: completedAt,
    queue_wait_ms: durationFromTiming(queuedAt, startedAt),
    research_duration_ms: researchMs,
    generation_duration_ms: generationMs,
    validation_duration_ms: validationMs,
    save_duration_ms: saveMs,
    active_total_ms: activeTotalMs,
    end_to_end_ms: endToEndMs,
    waiting_overhead_ms: endToEndMs !== null ? Math.max(0, endToEndMs - activeTotalMs) : null,
    visibility_delay_ms: visibilityDelayMs
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

function countMissingTimestamps(metrics: ArticlePerformanceMetrics[]) {
  const keys: Array<keyof ArticlePerformanceMetrics> = ["queued_at", "started_at", "generated_at", "visible_at", "completed_at"];
  return Object.fromEntries(keys.map((key) => [key, metrics.filter((metric) => !metric[key]).length]));
}

function roundTo(value: number, decimals: number) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}
