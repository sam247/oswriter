import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySeoRecommendations, buildSeoDecisionEngine } from "@/lib/seo/decision-engine";
import { createDefaultProjectProfile } from "@/lib/project/profile";
import type { ArticleDocument, ResearchPack } from "@/lib/types";

describe("SEO decision engine", () => {
  it("prioritises objective fixes and removes them after application", () => {
    const article = articleFixture();
    const initial = buildSeoDecisionEngine({ article, markdown: article.markdown });

    assert.equal(initial.recommendations[0]?.section, "fix");
    assert.ok(initial.recommendations.some((item) => item.id === "add-faq"));
    assert.ok(initial.recommendations.some((item) => item.id === "cite-sources"));

    const improvedMarkdown = applySeoRecommendations(article.markdown, initial.recommendations);
    const improved = buildSeoDecisionEngine({ article, markdown: improvedMarkdown });

    assert.ok(improved.score > initial.score);
    assert.ok(!improved.recommendations.some((item) => item.id === "add-faq"));
    assert.ok(!improved.recommendations.some((item) => item.id === "cite-sources"));
  });

  it("uses real research and project profile values for actionable improvements", () => {
    const article = articleFixture();
    const profile = { ...createDefaultProjectProfile(), regionKey: "united_kingdom", regionLabel: "United Kingdom", industryKey: "construction", industryLabel: "Construction", audienceKey: "project_managers", audienceLabel: "Project Managers" };
    const result = buildSeoDecisionEngine({ article, markdown: article.markdown, research: researchFixture(), profile });

    assert.ok(result.recommendations.some((item) => item.id === "insert-statistics"));
    assert.ok(result.recommendations.some((item) => item.id === "add-region-context"));
    assert.ok(result.recommendations.some((item) => item.id === "align-audience"));
    assert.ok(result.recommendations.every((item) => item.currentText && item.proposedText && item.difference));
  });
});

function articleFixture(): ArticleDocument {
  return {
    id: "article-seo",
    projectId: "default",
    jobId: "job-seo",
    title: "Planning Better Projects",
    status: "generated",
    markdown: "# Planning Better Projects\n\nA short guide to making sound decisions.\n\n## Main Issues\n\nProjects need clear evidence.",
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
    wordCount: 12,
    qualityScore: 80,
    researchSummary: "Research complete",
    validation: { pass: true, warnings: [], needsReviewReasons: [], qualityScore: 80, sectionScores: {}, faqScore: 0, seoScore: 70 },
    pipeline: [],
    sources: [{ id: "source-1", title: "Official planning guidance", url: "https://example.gov/guidance", domain: "example.gov", highlights: [], authorityScore: 90, relevanceScore: 90, accepted: true }],
    needsReviewReasons: []
  };
}

function researchFixture(): ResearchPack {
  return {
    articleId: "article-seo",
    title: "Planning Better Projects",
    queries: [],
    sources: [],
    rejectedSources: [],
    usefulFacts: ["Projects using early risk reviews reduced delays by 28%.", "Clear ownership improves delivery decisions."],
    rejectedFacts: [],
    questionsFound: [],
    headingsFound: [],
    authorityScore: 80,
    relevanceScore: 80,
    confidence: 80,
    warnings: [],
    requestIds: [],
    durationMs: 100,
    createdAt: "2026-06-18T00:00:00.000Z"
  };
}
