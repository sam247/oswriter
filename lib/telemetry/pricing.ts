export const EXA_PRICING_USD = {
  searchRequest: 0.007,
  contentPage: 0.001
} as const;

export interface ModelPricing {
  provider: string;
  inputPer1MTokens: number;
  outputPer1MTokens: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "deepseek-v4-flash": {
    provider: "openai-compatible",
    inputPer1MTokens: 0,
    outputPer1MTokens: 0
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

export function pricingForModel(model: string | null | undefined): ModelPricing {
  const key = modelKey(model);
  const registry = key ? MODEL_PRICING[key] : undefined;
  return {
    provider: envString(`AI_PROVIDER_${envModelName(model ?? "")}`) ?? registry?.provider ?? inferProvider(model),
    inputPer1MTokens: envNumber(`AI_COST_${envModelName(model ?? "")}_INPUT_PER_1M_TOKENS`) ?? registry?.inputPer1MTokens ?? envNumber("AI_INPUT_COST_PER_1M_TOKENS") ?? 0,
    outputPer1MTokens: envNumber(`AI_COST_${envModelName(model ?? "")}_OUTPUT_PER_1M_TOKENS`) ?? registry?.outputPer1MTokens ?? envNumber("AI_OUTPUT_COST_PER_1M_TOKENS") ?? 0
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
