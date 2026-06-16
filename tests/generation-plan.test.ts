import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONTROLS } from "@/lib/defaults";
import { buildArticleGenerationPlan } from "@/lib/generation/plan";
import { heuristicValidation } from "@/lib/validation/heuristics";
import type { ResearchPack } from "@/lib/types";

describe("article generation planning", () => {
  it("scales section count and token budget for 3000 word articles", () => {
    const plan = buildArticleGenerationPlan({ ...DEFAULT_CONTROLS, lengthTargetWords: 3000 });

    assert.equal(plan.targetWords, 3000);
    assert.equal(plan.minimumWords, 2400);
    assert.equal(plan.maximumWords, 3600);
    assert.equal(plan.h2SectionCount, 9);
    assert.equal(plan.maxOutputTokens, 6000);
  });

  it("flags outputs that are materially under the requested target", () => {
    const validation = heuristicValidation({
      title: "Soil Bearing Capacity Explained",
      markdown: `# Soil Bearing Capacity Explained

## One
Short section.

## Two
Short section.

## Three
Short section.

## Four
Short section.`,
      research: researchPack(),
      controls: { ...DEFAULT_CONTROLS, lengthTargetWords: 3000 }
    });

    assert.equal(validation.pass, false);
    assert.ok(validation.warnings.some((warning) => warning.includes("3000-word target")));
    assert.ok(validation.needsReviewReasons.includes("Completeness needs review."));
  });
});

function researchPack(): ResearchPack {
  return {
    articleId: "article_test",
    title: "Soil Bearing Capacity Explained",
    queries: ["soil bearing capacity"],
    sources: [],
    rejectedSources: [],
    usefulFacts: [],
    rejectedFacts: [],
    questionsFound: [],
    headingsFound: [],
    confidence: 90,
    authorityScore: 80,
    relevanceScore: 85,
    warnings: [],
    requestIds: [],
    durationMs: 0,
    createdAt: new Date().toISOString()
  };
}
