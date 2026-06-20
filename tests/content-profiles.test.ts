import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { CONTENT_PROFILES, resolveContentProfile } from "@/lib/content-profiles";
import { DEFAULT_CONTROLS } from "@/lib/defaults";
import { buildArticleGenerationPlan } from "@/lib/generation/plan";
import { buildGenerationPrompt } from "@/lib/models/openai";
import { heuristicValidation } from "@/lib/validation/heuristics";
import type { ResearchPack } from "@/lib/types";

const research: ResearchPack = {
  articleId: "article_1", title: "HubSpot vs Salesforce", queries: [], sources: [], rejectedSources: [],
  usefulFacts: [], rejectedFacts: [], questionsFound: [], headingsFound: [], authorityScore: 80,
  relevanceScore: 80, confidence: 80, warnings: [], requestIds: [], durationMs: 10, createdAt: new Date(0).toISOString()
};

describe("content profiles", () => {
  it("resolves article override, then project default, then industry explainer", () => {
    assert.equal(resolveContentProfile("comparison", "best_of"), "comparison");
    assert.equal(resolveContentProfile(undefined, "best_of"), "best_of");
    assert.equal(resolveContentProfile(undefined, undefined), "industry_explainer");
  });

  it("uses one registry to adapt planning and generation prompts", () => {
    const plan = buildArticleGenerationPlan(DEFAULT_CONTROLS, null, null, "comparison");
    assert.ok(plan.planningPriorities.some((item) => item.includes("Comparison format")));
    const prompt = buildGenerationPrompt({ title: research.title, research, controls: DEFAULT_CONTROLS, plan, contentProfile: "comparison" });
    assert.match(prompt, /Required outline pattern: Overview -> Feature Comparison -> Pricing/);
    assert.match(prompt, /same criteria to each entity/i);
  });

  it("applies profile-specific validation without creating separate validators", () => {
    const result = heuristicValidation({
      title: research.title,
      markdown: "# HubSpot vs Salesforce\n\n## Overview\n\nA balanced overview.\n\n## Features\n\nFeatures differ.\n\n## Pricing\n\nPricing differs.\n\n## FAQ\n\nAnswers.",
      research,
      controls: { ...DEFAULT_CONTROLS, lengthTargetWords: 300 },
      contentProfile: "comparison"
    });
    assert.ok(result.warnings.some((warning) => warning.includes("strengths and weaknesses")));
    assert.ok(result.warnings.some((warning) => warning.includes("recommendation")));
  });

  it("provides architecture definitions for later phase profiles", () => {
    assert.equal(CONTENT_PROFILES.thought_leadership.phase, 2);
    assert.equal(CONTENT_PROFILES.white_paper.phase, 3);
    assert.equal(CONTENT_PROFILES.white_paper.research.minimumSources, 20);
  });

  it("adds queryable Neon profile projections over canonical documents", async () => {
    const sql = await readFile(new URL("../db/migrations/0014_content_profiles.sql", import.meta.url), "utf8");
    assert.match(sql, /default_content_profile text/);
    assert.match(sql, /resolved_content_profile text/);
    assert.match(sql, /generated always as \(document ->> 'contentProfile'\) stored/);
  });
});
