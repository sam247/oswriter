import { calculateArticleScores } from "@/lib/scoring/article-scores";
import type { ArticleDocument, GenerationTelemetryDocument, ProjectDocument } from "@/lib/types";
import { calculateTelemetryQuality } from "@/lib/telemetry/quality";

export type DailySummaryCell = string | number;

export interface DailySummaryContext {
  telemetry: GenerationTelemetryDocument;
  article: ArticleDocument | null;
  project: ProjectDocument | null;
}

export const DAILY_SUMMARY_HEADERS = [
  "Date",
  "Articles Generated",
  "Articles Failed",
  "Success Rate %",
  "Average Word Count",
  "Average Telemetry Quality Score",
  "Average Research Score",
  "Average Evidence Score",
  "Average Target Achievement %",
  "Average H2 Achievement %",
  "Average H3 Achievement %",
  "Average Planning Breadth Coverage %",
  "Planner: Matched Plan",
  "Planner: Under Depth",
  "Planner: Over Depth",
  "Planner: Underplanned",
  "Average Generation Time (seconds)",
  "Average Research Time (seconds)",
  "Average Total Runtime (seconds)",
  "Total Research Cost",
  "Total Generation Cost",
  "Total Cost",
  "Average Cost Per Article",
  "Average Cost Per 1000 Words",
  "Average Concepts Found",
  "Average Sources Used",
  "Average Breadth Ratio",
  "Average Research Breadth Coverage %",
  "Articles by Industry",
  "Articles by Audience",
  "Articles by Region",
  "Top 5 Best Articles",
  "Top 5 Most Expensive Articles",
  "Bottom 5 Articles",
  "Articles vs Previous Day %",
  "Articles vs Previous 7 Day Average %",
  "Success Rate vs Previous Day (pp)",
  "Success Rate vs Previous 7 Day Average (pp)",
  "Average Word Count vs Previous Day %",
  "Average Word Count vs Previous 7 Day Average %",
  "Average Quality vs Previous Day (points)",
  "Average Quality vs Previous 7 Day Average (points)",
  "Average Research vs Previous Day (points)",
  "Average Research vs Previous 7 Day Average (points)",
  "Target Achievement vs Previous Day (pp)",
  "Target Achievement vs Previous 7 Day Average (pp)",
  "Average Total Runtime vs Previous Day %",
  "Average Total Runtime vs Previous 7 Day Average %",
  "Total Cost vs Previous Day %",
  "Total Cost vs Previous 7 Day Average %",
  "Average Cost Per Article vs Previous Day %",
  "Average Cost Per Article vs Previous 7 Day Average %"
] as const;

interface DailyMetrics {
  date: string;
  row: DailySummaryCell[];
  articlesGenerated: number;
  successRate: number;
  averageWordCount: number;
  averageQuality: number;
  averageResearch: number;
  averageTargetAchievement: number;
  averageTotalRuntimeSeconds: number;
  totalCost: number;
  averageCostPerArticle: number;
}

export function buildDailySummaryRows(contexts: DailySummaryContext[]) {
  const grouped = new Map<string, DailySummaryContext[]>();
  for (const context of contexts) {
    const date = dateOnly(context.telemetry.updatedAt);
    grouped.set(date, [...(grouped.get(date) ?? []), context]);
  }

  const metrics = [...grouped.entries()]
    .map(([date, items]) => buildMetrics(date, items))
    .sort((a, b) => a.date.localeCompare(b.date));

  return metrics.map((current, index) => {
    const previousDate = shiftDate(current.date, -1);
    const previous = metrics.find((item) => item.date === previousDate);
    const previousSeven = metrics.filter((item) => item.date < current.date && item.date >= shiftDate(current.date, -7));
    return [
      ...current.row,
      percentChange(current.articlesGenerated, previous?.articlesGenerated),
      percentChange(current.articlesGenerated, metricAverage(previousSeven, "articlesGenerated")),
      pointChange(current.successRate, previous?.successRate),
      pointChange(current.successRate, metricAverage(previousSeven, "successRate")),
      percentChange(current.averageWordCount, previous?.averageWordCount),
      percentChange(current.averageWordCount, metricAverage(previousSeven, "averageWordCount")),
      pointChange(current.averageQuality, previous?.averageQuality),
      pointChange(current.averageQuality, metricAverage(previousSeven, "averageQuality")),
      pointChange(current.averageResearch, previous?.averageResearch),
      pointChange(current.averageResearch, metricAverage(previousSeven, "averageResearch")),
      pointChange(current.averageTargetAchievement, previous?.averageTargetAchievement),
      pointChange(current.averageTargetAchievement, metricAverage(previousSeven, "averageTargetAchievement")),
      percentChange(current.averageTotalRuntimeSeconds, previous?.averageTotalRuntimeSeconds),
      percentChange(current.averageTotalRuntimeSeconds, metricAverage(previousSeven, "averageTotalRuntimeSeconds")),
      percentChange(current.totalCost, previous?.totalCost),
      percentChange(current.totalCost, metricAverage(previousSeven, "totalCost")),
      percentChange(current.averageCostPerArticle, previous?.averageCostPerArticle),
      percentChange(current.averageCostPerArticle, metricAverage(previousSeven, "averageCostPerArticle"))
    ];
  });
}

function buildMetrics(date: string, contexts: DailySummaryContext[]): DailyMetrics {
  const successful = contexts.filter(({ telemetry }) => telemetry.reviewStatus !== "failed");
  const failed = contexts.length - successful.length;
  const generated = successful.length;
  const totalAttempts = generated + failed;
  const scoreRows = successful.map(({ telemetry, article }) => {
    const calculated = article ? calculateArticleScores(article) : null;
    return {
      quality: telemetry.qualityScore ?? calculateTelemetryQuality(telemetry).qualityScore,
      research: article && calculated ? scoreValue(article.validation.sectionScores.research, calculated.research.score) : 0,
      evidence: calculated?.evidence.score ?? 0
    };
  });
  const words = successful.map(({ telemetry }) => telemetry.actualWords);
  const totalWords = sum(words);
  const totalResearchCost = sum(successful.map(({ telemetry }) => telemetry.estimatedResearchCostUsd));
  const totalGenerationCost = sum(successful.map(({ telemetry }) => telemetry.estimatedGenerationCostUsd ?? telemetry.estimatedAiCostUsd));
  const totalCost = sum(successful.map(({ telemetry }) => telemetry.totalCostUsd));
  const successRate = totalAttempts ? generated / totalAttempts * 100 : 0;
  const averageWordCount = average(words);
  const averageQuality = average(scoreRows.map((item) => item.quality));
  const averageResearch = average(scoreRows.map((item) => item.research));
  const averageEvidence = average(scoreRows.map((item) => item.evidence));
  const averageTargetAchievement = averageNumbers(successful.map(({ telemetry }) => telemetry.targetAchievementPercent));
  const averageTotalRuntimeSeconds = millisecondsToSeconds(averageNumbers(successful.map(({ telemetry }) => telemetry.totalDurationMs)));
  const averageCostPerArticle = generated ? totalCost / generated : 0;

  const row: DailySummaryCell[] = [
    date,
    generated,
    failed,
    rounded(successRate),
    rounded(averageWordCount),
    rounded(averageQuality),
    rounded(averageResearch),
    rounded(averageEvidence),
    rounded(averageTargetAchievement),
    rounded(averageNumbers(successful.map(({ telemetry }) => telemetry.h2AchievementPercent))),
    rounded(averageNumbers(successful.map(({ telemetry }) => telemetry.h3AchievementPercent))),
    rounded(averageNumbers(successful.map(({ telemetry }) => telemetry.actualBreadthCoveragePercent))),
    countValue(successful, ({ telemetry }) => telemetry.plannerOutcome, "matched_plan"),
    countValue(successful, ({ telemetry }) => telemetry.plannerOutcome, "under_depth"),
    countValue(successful, ({ telemetry }) => telemetry.plannerOutcome, "over_depth"),
    countValue(successful, ({ telemetry }) => telemetry.breadthStatus, "underplanned"),
    rounded(millisecondsToSeconds(averageNumbers(successful.map(({ telemetry }) => telemetry.generationDurationMs)))),
    rounded(millisecondsToSeconds(averageNumbers(successful.map(({ telemetry }) => telemetry.researchDurationMs)))),
    rounded(averageTotalRuntimeSeconds),
    money(totalResearchCost),
    money(totalGenerationCost),
    money(totalCost),
    money(averageCostPerArticle),
    money(totalWords ? totalCost / (totalWords / 1000) : 0),
    rounded(averageNumbers(successful.map(({ telemetry }) => telemetry.researchConceptCount))),
    rounded(average(successful.map(({ telemetry }) => telemetry.sourcesAccepted))),
    rounded(averageNumbers(successful.map(({ telemetry }) => telemetry.plannedBreadthRatio))),
    rounded(averageNumbers(successful.map(({ telemetry }) => telemetry.actualBreadthCoveragePercent))),
    breakdown(successful.map(({ telemetry }) => telemetry.industry)),
    breakdown(successful.map(({ telemetry }) => telemetry.audience)),
    breakdown(successful.map(({ telemetry }) => telemetry.region)),
    rankedArticles(successful, "quality", "desc"),
    rankedArticles(successful, "cost", "desc"),
    rankedArticles(successful, "quality", "asc")
  ];

  return {
    date,
    row,
    articlesGenerated: generated,
    successRate,
    averageWordCount,
    averageQuality,
    averageResearch,
    averageTargetAchievement,
    averageTotalRuntimeSeconds,
    totalCost,
    averageCostPerArticle
  };
}

function rankedArticles(contexts: DailySummaryContext[], metric: "quality" | "cost", direction: "asc" | "desc") {
  return contexts
    .flatMap((context) => {
      const value = metric === "quality"
        ? context.telemetry.qualityScore ?? calculateTelemetryQuality(context.telemetry).qualityScore
        : context.telemetry.totalCostUsd;
      return [{ context, value }];
    })
    .sort((a, b) => direction === "desc" ? b.value - a.value : a.value - b.value)
    .slice(0, 5)
    .map(({ context, value }) => {
      const title = context.article?.title ?? context.telemetry.articleId;
      const project = context.project?.name ?? context.telemetry.projectId;
      return `${title} [${project}] (${metric === "quality" ? `Q ${rounded(value)}` : `$${money(value).toFixed(6)}`})`;
    })
    .join(" | ");
}

function breakdown(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value?.trim() || "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => `${key}: ${count}`)
    .join(" | ");
}

function countValue(contexts: DailySummaryContext[], select: (context: DailySummaryContext) => string | null | undefined, expected: string) {
  return contexts.filter((context) => select(context) === expected).length;
}

type TrendMetricKey = "articlesGenerated" | "successRate" | "averageWordCount" | "averageQuality" | "averageResearch" | "averageTargetAchievement" | "averageTotalRuntimeSeconds" | "totalCost" | "averageCostPerArticle";

function metricAverage(items: DailyMetrics[], key: TrendMetricKey) {
  const values = items.map((item) => item[key]);
  return values.length ? average(values) : undefined;
}

function percentChange(current: number, baseline: number | undefined) {
  if (baseline == null || baseline === 0) return "";
  return rounded((current - baseline) / baseline * 100);
}

function pointChange(current: number, baseline: number | undefined) {
  if (baseline == null) return "";
  return rounded(current - baseline);
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function averageNumbers(values: Array<number | null | undefined>) {
  return average(values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)));
}

function scoreValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function average(values: number[]) {
  return values.length ? sum(values) / values.length : 0;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function millisecondsToSeconds(value: number) {
  return value / 1000;
}

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

function money(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
