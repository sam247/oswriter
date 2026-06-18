import { normalizeProjectProfile } from "@/lib/project/profile";
import { estimateGenerationCost, estimateResearchCostUsd, roundUsd } from "@/lib/telemetry/costs";
import type { GenerationTelemetryDocument, ProjectProfile } from "@/lib/types";

const DEFAULT_SEARCHES_PER_ARTICLE = 6;
const DEFAULT_CONTENT_PAGES_PER_ARTICLE = 30;
const DEFAULT_INPUT_TOKENS_PER_ARTICLE = 4_500;
const DEFAULT_RUNTIME_MS_PER_ARTICLE = 90_000;
const RECENT_SAMPLE_SIZE = 20;

export interface QueueCostProjection {
  articleCount: number;
  estimatedWords: number;
  estimatedResearchCostUsd: number;
  estimatedGenerationCostUsd: number;
  estimatedTotalCostUsd: number;
  estimatedRuntimeMs: number;
}

export interface QueueProjectionInput {
  articleCount: number;
  profile?: ProjectProfile | null;
  fallbackTargetWords: number;
  telemetry?: GenerationTelemetryDocument[];
  generationModel?: string | null;
  generationProvider?: string | null;
}

export function projectQueueCost(input: QueueProjectionInput): QueueCostProjection {
  const articleCount = Math.max(0, Math.floor(finiteOr(input.articleCount, 0)));
  const profile = normalizeProjectProfile(input.profile, input.fallbackTargetWords);
  const recent = recentTelemetryForProfile(input.telemetry ?? [], profile);
  const searchesPerArticle = averagePositive(recent, (item) => item.exaSearchRequests ?? item.exaSearchCalls) ?? DEFAULT_SEARCHES_PER_ARTICLE;
  const contentPagesPerArticle = averagePositive(recent, (item) => item.exaContentPages ?? item.exaContentCalls) ?? DEFAULT_CONTENT_PAGES_PER_ARTICLE;
  const inputTokensPerArticle = averagePositive(recent, (item) => item.inputTokens) ?? DEFAULT_INPUT_TOKENS_PER_ARTICLE;
  const outputTokensPerWord = weightedOutputTokensPerWord(recent);
  const outputTokensPerArticle = Math.round(profile.defaultTargetWords * outputTokensPerWord);
  const runtimeMsPerArticle = averagePositive(recent, (item) => item.totalDurationMs) ?? DEFAULT_RUNTIME_MS_PER_ARTICLE;
  const model = input.generationModel ?? recent.find((item) => item.generationModel || item.model)?.generationModel
    ?? recent.find((item) => item.model)?.model
    ?? "deepseek-v4-flash";
  const provider = input.generationProvider ?? recent.find((item) => item.generationProvider)?.generationProvider;
  const researchCost = estimateResearchCostUsd(searchesPerArticle * articleCount, contentPagesPerArticle * articleCount);
  const generationCost = estimateGenerationCost(inputTokensPerArticle * articleCount, outputTokensPerArticle * articleCount, model, provider).costUsd;

  return {
    articleCount,
    estimatedWords: profile.defaultTargetWords * articleCount,
    estimatedResearchCostUsd: researchCost,
    estimatedGenerationCostUsd: generationCost,
    estimatedTotalCostUsd: roundUsd(researchCost + generationCost),
    estimatedRuntimeMs: Math.round(runtimeMsPerArticle * articleCount)
  };
}

function recentTelemetryForProfile(telemetry: GenerationTelemetryDocument[], profile: ProjectProfile) {
  const recent = [...telemetry]
    .filter((item) => item.reviewStatus === "generated" || item.reviewStatus === "needs_review")
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  const matching = recent.filter((item) =>
    item.profileVersion === profile.profileVersion
    && item.region === profile.regionKey
    && item.industry === profile.industryKey
    && item.audience === profile.audienceKey
  );
  return (matching.length ? matching : recent).slice(0, RECENT_SAMPLE_SIZE);
}

function weightedOutputTokensPerWord(telemetry: GenerationTelemetryDocument[]) {
  const totals = telemetry.reduce((result, item) => {
    if (item.outputTokens > 0 && item.actualWords > 0) {
      result.tokens += item.outputTokens;
      result.words += item.actualWords;
    }
    return result;
  }, { tokens: 0, words: 0 });
  return totals.words > 0 ? totals.tokens / totals.words : 4 / 3;
}

function averagePositive(items: GenerationTelemetryDocument[], value: (item: GenerationTelemetryDocument) => number | null | undefined) {
  const values = items.map(value).filter((item): item is number => typeof item === "number" && Number.isFinite(item) && item > 0);
  return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null;
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}
