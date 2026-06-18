import { EXA_PRICING_USD, pricingForModel } from "@/lib/telemetry/pricing";

const USD_PRECISION = 1_000_000;

export function estimateAiCostUsd(inputTokens: number, outputTokens: number, model?: string | null, provider?: string | null) {
  return estimateGenerationCost(inputTokens, outputTokens, model, provider).costUsd;
}

export function estimateGenerationCost(inputTokens: number, outputTokens: number, model?: string | null, provider?: string | null) {
  const pricing = pricingForModel(model, provider);
  // V1 telemetry has no cache token split, so all input tokens are conservatively priced as cache misses.
  const inputRate = pricing.inputCacheMissPer1MTokens ?? pricing.inputPer1MTokens;
  const outputRate = pricing.outputPer1MTokens;
  return {
    costUsd: roundUsd((inputTokens / 1_000_000 * inputRate) + (outputTokens / 1_000_000 * outputRate)),
    pricingSource: pricing.pricingSource ?? null
  };
}

export function estimateResearchCostUsd(exaSearchCalls: number, exaContentCalls: number) {
  return roundUsd(estimatedExaSearchCostUsd(exaSearchCalls) + estimatedExaContentCostUsd(exaContentCalls));
}

export function estimatedExaSearchCostUsd(exaSearchRequests: number) {
  return roundUsd(exaSearchRequests * EXA_PRICING_USD.searchRequest);
}

export function estimatedExaContentCostUsd(exaContentPages: number) {
  return roundUsd(exaContentPages * EXA_PRICING_USD.contentPage);
}

export function roundUsd(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * USD_PRECISION) / USD_PRECISION;
}
