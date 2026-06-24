import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONTROLS } from "@/lib/defaults";
import { buildArticleGenerationPlan, buildPlanningDiagnostics } from "@/lib/generation/plan";
import { buildGenerationPrompt } from "@/lib/models/openai";
import { normalizeProjectProfile, snapshotProjectProfile } from "@/lib/project/profile";
import { heuristicValidation } from "@/lib/validation/heuristics";
import type { ProjectSiteProfileDocument, ResearchPack } from "@/lib/types";

describe("article generation planning", () => {
  it("scales section count and token budget for 3000 word articles", () => {
    const plan = buildArticleGenerationPlan({ ...DEFAULT_CONTROLS, lengthTargetWords: 3000 });

    assert.equal(plan.targetWords, 3000);
    assert.equal(plan.minimumWords, 2400);
    assert.equal(plan.maximumWords, 3600);
    assert.equal(plan.h2SectionCount, 9);
    assert.equal(plan.maxOutputTokens, 6000);
  });

  it("uses project profile target words and lightly adapts sections for procurement audiences", () => {
    const profileSnapshot = snapshotProjectProfile(normalizeProjectProfile({
      industryKey: "construction",
      audienceKey: "procurement_teams",
      defaultTargetWords: 2400
    }));
    const plan = buildArticleGenerationPlan({ ...DEFAULT_CONTROLS, lengthTargetWords: 1200 }, profileSnapshot);

    assert.equal(plan.targetWords, 2400);
    assert.ok(plan.h2SectionCount >= 7);
    assert.equal(plan.expectedDepth, "deep");
    assert.equal(plan.h3SectionCount, plan.h2SectionCount * 2);
    assert.deepEqual(plan.planningPriorities, ["costs", "supplier selection", "procurement strategy", "compliance", "risk", "lead times"]);
  });

  it("biases SaaS CTO planning towards strategic architecture decisions", () => {
    const profileSnapshot = snapshotProjectProfile(normalizeProjectProfile({ industryKey: "saas", audienceKey: "ctos" }));
    const plan = buildArticleGenerationPlan(DEFAULT_CONTROLS, profileSnapshot);

    assert.deepEqual(plan.planningPriorities, ["scalability", "strategy", "architecture decisions", "risk", "business impact"]);
  });

  it("records H2 and H3 achievement without changing generation behaviour", () => {
    const plan = buildArticleGenerationPlan({ ...DEFAULT_CONTROLS, lengthTargetWords: 2000 });
    const diagnostics = buildPlanningDiagnostics(plan, `# Guide

## One
Useful section.

## Two
Useful section.

### Detail
Useful detail.`);

    assert.equal(diagnostics.plannedH2Count, plan.h2SectionCount);
    assert.equal(diagnostics.plannedH3Count, plan.h3SectionCount);
    assert.equal(diagnostics.actualH2Count, 2);
    assert.equal(diagnostics.actualH3Count, 1);
    assert.ok(diagnostics.targetAchievementPercent < 80);
    assert.ok(["under_depth", "under_target"].includes(diagnostics.plannerOutcome));
  });

  it("diagnoses topic breadth planning and coverage", () => {
    const plan = buildArticleGenerationPlan({ ...DEFAULT_CONTROLS, lengthTargetWords: 1400 });
    const research = {
      researchConcepts: ["Basic Authentication", "API Keys", "Sessions", "JWT", "OAuth 2.0", "OpenID Connect", "Mutual TLS", "Signed Requests"],
      researchConceptCount: 8
    };
    const diagnostics = buildPlanningDiagnostics(plan, `# REST API Authentication Methods

## Basic Authentication
Basic auth details.

## API Keys
API key details.`, research);

    assert.equal(diagnostics.researchConceptCount, 8);
    assert.equal(diagnostics.actualBreadthCoverage, 2);
    assert.equal(diagnostics.actualBreadthCoveragePercent, 25);
    assert.equal(diagnostics.breadthStatus, plan.h2SectionCount < 6 ? "underplanned" : "undercovered");
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

  it("adds breadth advisories without reducing quality score", () => {
    const base = heuristicValidation({
      title: "REST API Authentication Methods",
      markdown: broadMarkdown(),
      research: researchPack(),
      controls: { ...DEFAULT_CONTROLS, lengthTargetWords: 1200 }
    });
    const broadResearch = {
      ...researchPack(),
      researchConcepts: ["Basic Authentication", "API Keys", "Sessions", "JWT", "OAuth 2.0", "OpenID Connect", "Mutual TLS", "Signed Requests"],
      researchConceptCount: 8
    };
    const withBreadthAdvisory = heuristicValidation({
      title: "REST API Authentication Methods",
      markdown: broadMarkdown(),
      research: broadResearch,
      controls: { ...DEFAULT_CONTROLS, lengthTargetWords: 1200 }
    });

    assert.equal(withBreadthAdvisory.qualityScore, base.qualityScore);
    assert.ok(withBreadthAdvisory.advisories?.includes("Topic breadth may be underrepresented."));
    assert.equal(withBreadthAdvisory.needsReviewReasons.includes("Topic breadth may be underrepresented."), false);
  });

  it("recommends website-owned entities before generic retail examples during planning and prompting", () => {
    const title = "What To Wear For A Seaside Weekend In Britain";
    const siteProfile = ecommerceSiteProfile();
    const plan = buildArticleGenerationPlan(DEFAULT_CONTROLS, null, siteProfile, "industry_explainer", title);
    const prompt = buildGenerationPrompt({ title, controls: DEFAULT_CONTROLS, research: researchPack(), siteProfile, plan });

    assert.deepEqual(plan.websiteEntityRecommendations?.brands, ["Joules", "White Stuff", "Seasalt", "Barbour", "Inis"]);
    assert.deepEqual(plan.websiteEntityRecommendations?.brandUsageTarget, { min: 2, max: 5 });
    assert.deepEqual(plan.websiteEntityRecommendations?.categories, ["Clothing", "Footwear", "Accessories"]);
    assert.deepEqual(plan.websiteEntityRecommendations?.productTypes, ["Knitwear", "Handbags", "Boots", "Scarves"]);
    assert.ok(plan.planningPriorities.some((value) => value.includes("prefer website-owned brands before external brands")));
    assert.ok(plan.planningPriorities.some((value) => value.includes("weave 2-5 natural mentions")));
    assert.ok(plan.planningPriorities.some((value) => value.includes("only introduce external brands, retailers, or product examples")));
    assert.ok(plan.knowledgeContext?.some((value) => value.includes("Recommended website brands for this article: Joules, White Stuff, Seasalt, Barbour")));
    assert.ok(plan.knowledgeContext?.some((value) => value.includes("Brand usage target for this article: 2-5 natural mentions")));
    assert.match(prompt, /Website entity recommendations for this article:/);
    assert.match(prompt, /Prefer website-owned entities before external brands, retailers, or generic examples when they are relevant to the title\./);
    assert.match(prompt, /weave 2-5 brand mentions into examples and recommendations across the article rather than keeping product advice generic\./);
    assert.match(prompt, /Recommended website categories for this article: Clothing, Footwear, Accessories/);
    assert.match(prompt, /Preferred website CTA for this article: Shop Now/);
  });

  it("surfaces relevant website-owned brands for coastal clothing articles", () => {
    const title = "What To Wear For A Seaside Weekend In Britain";
    const prompt = promptForTitle(title);

    assert.match(prompt, /Recommended website brands for this article: Joules, White Stuff, Seasalt, Barbour, Inis/);
    assert.match(prompt, /a waterproof jacket from brands such as Joules or White Stuff/);
  });

  it("surfaces relevant website-owned brands for gifting articles", () => {
    const title = "Best Gift Ideas For A Relaxing Coastal Weekend";
    const prompt = promptForTitle(title);

    assert.match(prompt, /Recommended website brands for this article: Joules, White Stuff, Seasalt, Barbour, Inis/);
    assert.match(prompt, /Brand usage target for this article: 2-5 natural mentions when contextually relevant/);
    assert.match(prompt, /Brand mentions must feel natural inside outfit, gifting, accessories, or product recommendations\./);
  });

  it("surfaces relevant website-owned brands for accessories articles", () => {
    const title = "How To Choose Accessories For A British Weekend Away";
    const prompt = promptForTitle(title);

    assert.match(prompt, /Recommended website brands for this article: Joules, White Stuff, Seasalt, Barbour, Inis/);
    assert.match(prompt, /Recommended website categories for this article: Accessories, Clothing, Footwear/);
    assert.match(prompt, /Recommended website product types for this article:/);
  });
});

function broadMarkdown() {
  return `# REST API Authentication Methods

## Basic Authentication
Basic auth details for APIs.

## API Keys
API key details for APIs.

## FAQ

### What should teams compare first?
Compare implementation needs first.`;
}

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

function ecommerceSiteProfile(): ProjectSiteProfileDocument {
  return {
    projectId: "anna-davies",
    domain: "annadavies.co.uk",
    pageCount: 50,
    services: [],
    products: ["Clothing", "Footwear", "Accessories", "Knitwear", "Boots"],
    audiences: ["Women", "Lifestyle Shoppers", "Gift Buyers"],
    locations: [],
    ctas: ["Shop Now"],
    writingSignals: ["UK English"],
    generatedAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z",
    metadata: {
      businessType: "ecommerce",
      strategyBusinessType: "ecommerce",
      ecommerce: {
        brands: ["Joules", "White Stuff", "Seasalt", "Barbour", "Inis"],
        categories: ["Clothing", "Footwear", "Accessories", "Gifts"],
        productTypes: ["Knitwear", "Handbags", "Boots", "Scarves", "Dresses"]
      }
    }
  };
}

function promptForTitle(title: string) {
  const siteProfile = ecommerceSiteProfile();
  const plan = buildArticleGenerationPlan(DEFAULT_CONTROLS, null, siteProfile, "industry_explainer", title);
  return buildGenerationPrompt({ title, controls: DEFAULT_CONTROLS, research: researchPack(), siteProfile, plan });
}
