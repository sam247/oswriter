import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateGenerationCost } from "@/lib/telemetry/costs";
import { pricingForModel } from "@/lib/telemetry/pricing";

describe("generation cost pricing", () => {
  it("uses DeepSeek cache-miss pricing for an OpenAI-compatible provider", () => {
    const estimate = estimateGenerationCost(4552, 2263, "deepseek-v4-flash", "openai-compatible");

    assert.equal(estimate.costUsd, 0.001271);
    assert.equal(estimate.pricingSource, "deepseek-v4-flash_cache_miss_assumed");
  });

  it("selects DeepSeek pricing by model when the provider is generic", () => {
    const pricing = pricingForModel("deepseek-v4-flash", "openai-compatible");

    assert.equal(pricing.inputCacheHitPer1MTokens, 0.0028);
    assert.equal(pricing.inputCacheMissPer1MTokens, 0.14);
    assert.equal(pricing.outputPer1MTokens, 0.28);
  });
});
