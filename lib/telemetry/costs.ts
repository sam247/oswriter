const USD_PRECISION = 1_000_000;

export function estimateAiCostUsd(inputTokens: number, outputTokens: number, model?: string | null) {
  const inputRate = rateForModel(model, "INPUT") ?? envNumber("AI_INPUT_COST_PER_1M_TOKENS");
  const outputRate = rateForModel(model, "OUTPUT") ?? envNumber("AI_OUTPUT_COST_PER_1M_TOKENS");
  return roundUsd((inputTokens / 1_000_000 * inputRate) + (outputTokens / 1_000_000 * outputRate));
}

export function estimateResearchCostUsd(exaSearchCalls: number, exaContentCalls: number) {
  const searchRate = envNumber("EXA_SEARCH_COST_USD");
  const contentRate = envNumber("EXA_CONTENT_COST_USD");
  return roundUsd((exaSearchCalls * searchRate) + (exaContentCalls * contentRate));
}

export function roundUsd(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * USD_PRECISION) / USD_PRECISION;
}

function rateForModel(model: string | null | undefined, direction: "INPUT" | "OUTPUT") {
  if (!model) return null;
  return envNumber(`AI_COST_${envModelName(model)}_${direction}_PER_1M_TOKENS`);
}

function envModelName(model: string) {
  return model.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/(^_|_$)/g, "");
}

function envNumber(name: string) {
  const raw = process.env[name];
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}
