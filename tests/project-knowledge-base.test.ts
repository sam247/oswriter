import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultProject, DEFAULT_CONTROLS } from "@/lib/defaults";
import { buildArticleGenerationPlan } from "@/lib/generation/plan";
import { buildGenerationPrompt } from "@/lib/models/openai";
import { EMPTY_PROJECT_KNOWLEDGE_BASE, normalizeProjectKnowledgeBase, projectKnowledgeContextLines } from "@/lib/project/knowledge-base";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { WorkspaceStore } from "@/lib/storage/storage";
import type { ArticleGenerationInput, ProjectKnowledgeBase, ResearchPack } from "@/lib/types";

describe("project knowledge base", () => {
  it("does not alter planning or prompt output when every field is blank", () => {
    const input = generationInput();
    const baselinePlan = buildArticleGenerationPlan(DEFAULT_CONTROLS);
    const blankPlan = buildArticleGenerationPlan(DEFAULT_CONTROLS, null, EMPTY_PROJECT_KNOWLEDGE_BASE);

    assert.deepEqual(blankPlan, baselinePlan);
    assert.equal(buildGenerationPrompt({ ...input, knowledgeBase: EMPTY_PROJECT_KNOWLEDGE_BASE }), buildGenerationPrompt(input));
    assert.deepEqual(projectKnowledgeContextLines(EMPTY_PROJECT_KNOWLEDGE_BASE), []);
  });

  it("adds populated context to planning and generation", () => {
    const knowledgeBase = populatedKnowledgeBase();
    const plan = buildArticleGenerationPlan(DEFAULT_CONTROLS, null, knowledgeBase);
    const prompt = buildGenerationPrompt({ ...generationInput(), knowledgeBase });

    assert.ok(plan.knowledgeContext?.includes("Brand Name: NitNOT"));
    assert.ok(plan.planningPriorities.includes("follow the project writing rules"));
    assert.match(prompt, /Knowledge Base \(use during planning, outline construction, and writing/);
    assert.match(prompt, /Services: Head lice screening/);
    assert.match(prompt, /Preferred CTA: Book a screening appointment\./);
  });

  it("persists normalized knowledge fields with the project document", async () => {
    const store = new WorkspaceStore(new MemoryStorageAdapter());
    const project = { ...createDefaultProject(), knowledgeBase: normalizeProjectKnowledgeBase({ brandName: "  NitNOT  ", services: " Screening " }) };

    await store.saveProject(project);
    const saved = await store.getProject(project.id);

    assert.equal(saved?.knowledgeBase?.brandName, "NitNOT");
    assert.equal(saved?.knowledgeBase?.services, "Screening");
    assert.equal(saved?.knowledgeBase?.preferredCTA, "");
  });
});

function populatedKnowledgeBase(): ProjectKnowledgeBase {
  return {
    brandName: "NitNOT",
    website: "https://nitnot.example",
    aboutBusiness: "A specialist screening provider.",
    services: "Head lice screening\nHead lice treatment",
    products: "",
    targetCustomer: "Parents of children aged 4-12",
    writingRules: "Use UK English. Avoid medical claims.",
    preferredCTA: "Book a screening appointment."
  };
}

function generationInput(): ArticleGenerationInput {
  return {
    title: "Head Lice Screening Guide",
    controls: DEFAULT_CONTROLS,
    research: researchFixture()
  };
}

function researchFixture(): ResearchPack {
  return {
    articleId: "article-kb",
    title: "Head Lice Screening Guide",
    queries: [],
    sources: [],
    rejectedSources: [],
    usefulFacts: ["Screening should be carried out carefully."],
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
