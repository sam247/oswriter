export const EXA_PRICING_USD = {
  searchRequest: 0.007,
  contentPage: 0.001
} as const;

export interface ModelPricing {
  provider: string;
  inputPer1MTokens: number;
  inputCacheHitPer1MTokens?: number;
  inputCacheMissPer1MTokens?: number;
  outputPer1MTokens: number;
  pricingSource?: string;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "deepseek-v4-flash": {
    provider: "openai-compatible",
    inputPer1MTokens: 0.14,
    inputCacheHitPer1MTokens: 0.0028,
    inputCacheMissPer1MTokens: 0.14,
    outputPer1MTokens: 0.28,
    pricingSource: "deepseek-v4-flash_cache_miss_assumed"
  },
  "gpt-4.1-mini": {
    provider: "openai",
    inputPer1MTokens: 0.4,
    outputPer1MTokens: 1.6
  },
  "gpt-4.1": {
    provider: "openai",
    inputPer1MTokens: 2,
    outputPer1MTokens: 8
  },
  "gpt-4o-mini": {
    provider: "openai",
    inputPer1MTokens: 0.15,
    outputPer1MTokens: 0.6
  },
  "gpt-4o": {
    provider: "openai",
    inputPer1MTokens: 2.5,
    outputPer1MTokens: 10
  }
};

export function pricingForModel(model: string | null | undefined, provider?: string | null): ModelPricing {
  const key = modelKey(model);
  const normalizedProvider = provider?.trim().toLowerCase();
  const deepSeekViaCompatibleProvider = normalizedProvider === "openai-compatible" && key?.startsWith("deepseek");
  const registry = key ? MODEL_PRICING[key] ?? (deepSeekViaCompatibleProvider ? MODEL_PRICING["deepseek-v4-flash"] : undefined) : undefined;
  return {
    provider: envString(`AI_PROVIDER_${envModelName(model ?? "")}`) ?? provider ?? registry?.provider ?? inferProvider(model),
    inputPer1MTokens: envNumber(`AI_COST_${envModelName(model ?? "")}_INPUT_PER_1M_TOKENS`) ?? registry?.inputPer1MTokens ?? envNumber("AI_INPUT_COST_PER_1M_TOKENS") ?? 0,
    inputCacheHitPer1MTokens: registry?.inputCacheHitPer1MTokens,
    inputCacheMissPer1MTokens: registry?.inputCacheMissPer1MTokens,
    outputPer1MTokens: envNumber(`AI_COST_${envModelName(model ?? "")}_OUTPUT_PER_1M_TOKENS`) ?? registry?.outputPer1MTokens ?? envNumber("AI_OUTPUT_COST_PER_1M_TOKENS") ?? 0,
    pricingSource: key && registry ? (registry.pricingSource ?? key) : undefined
  };
}

function modelKey(model: string | null | undefined) {
  return model?.trim().toLowerCase();
}

function inferProvider(model: string | null | undefined) {
  const normalized = modelKey(model) ?? "";
  if (normalized.startsWith("gpt-") || normalized.startsWith("o")) return "openai";
  if (normalized.includes("deepseek")) return "deepseek";
  return "openai-compatible";
}

function envModelName(model: string) {
  return model.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/(^_|_$)/g, "");
}

function envString(name: string) {
  return process.env[name]?.trim() || null;
}

function envNumber(name: string) {
  const raw = process.env[name];
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
