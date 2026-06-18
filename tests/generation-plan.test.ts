import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONTROLS } from "@/lib/defaults";
import { buildArticleGenerationPlan, buildPlanningDiagnostics } from "@/lib/generation/plan";
import { normalizeProjectProfile, snapshotProjectProfile } from "@/lib/project/profile";
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
