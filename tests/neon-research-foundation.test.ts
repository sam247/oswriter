import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { NeonStorageProvider } from "@/lib/storage/neon";
import { WorkspaceStore } from "@/lib/storage/storage";
import type { ProjectDocument, ResearchPack } from "@/lib/types";

const canRunNeon = Boolean(process.env.TEST_NEON_DATABASE_URL);
const neonTest = canRunNeon ? test : test.skip;

neonTest("NeonStorageProvider persists reusable research runs, sources, findings, and citations", async () => {
  const env = snapshotEnv();
  const id = randomUUID().replaceAll("-", "").slice(0, 12);
  const projectId = `research_project_${id}`;

  process.env.DATABASE_URL = process.env.TEST_NEON_DATABASE_URL;
  process.env.OSW_AUTH_USER_EMAIL = "research-foundation@example.test";
  process.env.OSW_AUTH_USER_ID = `user_research_${id}`;
  process.env.OSW_ORGANISATION_ID = `org_research_${id}`;
  process.env.OSW_ORGANISATION_NAME = "Research Foundation Organisation";
  process.env.OSW_ORGANISATION_SLUG = `research-foundation-${id}`;

  try {
    const provider = new NeonStorageProvider();
    const store = new WorkspaceStore(provider);
    const now = new Date().toISOString();
    const project: ProjectDocument = {
      id: projectId,
      name: "Research Foundation",
      createdAt: now,
      updatedAt: now
    };
    await provider.createProject(project);

    await store.saveResearch(researchPack({
      projectId,
      articleId: `article_a_${id}`,
      title: "Reusable source article A",
      createdAt: now,
      sharedUrl: "https://www.gov.uk/guidance/reusable-source"
    }), projectId);
    await store.saveResearch(researchPack({
      projectId,
      articleId: `article_b_${id}`,
      title: "Reusable source article B",
      createdAt: new Date(Date.now() + 1_000).toISOString(),
      sharedUrl: "https://www.gov.uk/guidance/reusable-source"
    }), projectId);
    await store.saveResearch(researchPack({
      projectId,
      articleId: `article_a_${id}`,
      title: "Reusable source article A regenerated",
      createdAt: new Date(Date.now() + 2_000).toISOString(),
      sharedUrl: "https://www.gov.uk/guidance/reusable-source"
    }), projectId);

    const runs = await provider.listResearchRuns(projectId);
    assert.equal(runs.length, 3);
    assert.ok(runs.every((run) => run.projectId === projectId));
    assert.ok(runs.some((run) => run.articleId === `article_a_${id}`));
    assert.ok(runs.some((run) => run.articleId === `article_b_${id}`));
    assert.equal(runs.filter((run) => run.articleId === `article_a_${id}`).length, 2);

    const sources = await provider.listResearchSources(projectId);
    assert.equal(sources.filter((source) => source.url === "https://www.gov.uk/guidance/reusable-source").length, 1);
    assert.ok(sources.length >= 2);

    const findings = await provider.listResearchFindings(projectId);
    assert.ok(findings.some((finding) => finding.findingType === "useful_fact"));
    assert.ok(findings.some((finding) => finding.findingType === "question"));

    const citations = await provider.listSourceCitations(projectId);
    assert.equal(citations.filter((citation) => citation.url === "https://www.gov.uk/guidance/reusable-source" && citation.citationType === "accepted_source").length, 3);
    assert.ok(citations.every((citation) => citation.projectId === projectId));
    assert.ok(citations.some((citation) => citation.findingId && citation.citationType === "finding_source"));

    await provider.deleteProject(projectId);
  } finally {
    restoreEnv(env);
  }
});

function researchPack(input: { projectId: string; articleId: string; title: string; createdAt: string; sharedUrl: string }): ResearchPack {
  return {
    articleId: input.articleId,
    projectId: input.projectId,
    title: input.title,
    queries: [input.title, `${input.title} guidance`],
    sources: [
      {
        id: "src_1",
        title: "Reusable GOV.UK source",
        url: input.sharedUrl,
        domain: "www.gov.uk",
        summary: "Reusable guidance with practical requirements and compliance details.",
        highlights: ["Guidance should be checked against current project requirements."],
        authorityScore: 95,
        relevanceScore: 90,
        accepted: true
      },
      {
        id: "src_2",
        title: `${input.title} supporting source`,
        url: `https://water.org.uk/${encodeURIComponent(input.articleId)}`,
        domain: "water.org.uk",
        summary: "Supporting water sector detail.",
        highlights: ["Water sector evidence can support practical article guidance."],
        authorityScore: 78,
        relevanceScore: 84,
        accepted: true
      }
    ],
    rejectedSources: [],
    usefulFacts: [
      "Reusable guidance with practical requirements can support multiple future article drafts.",
      "Persisted research should remain available independently of generated article content."
    ],
    rejectedFacts: [],
    questionsFound: [`What should readers check before using ${input.title}?`],
    headingsFound: ["Requirements", "Practical Checks"],
    authorityScore: 87,
    relevanceScore: 87,
    confidence: 88,
    warnings: [],
    requestIds: [`req_${input.articleId}`],
    durationMs: 1234,
    createdAt: input.createdAt
  };
}

function snapshotEnv() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    OSW_AUTH_USER_EMAIL: process.env.OSW_AUTH_USER_EMAIL,
    OSW_AUTH_USER_ID: process.env.OSW_AUTH_USER_ID,
    OSW_ORGANISATION_ID: process.env.OSW_ORGANISATION_ID,
    OSW_ORGANISATION_NAME: process.env.OSW_ORGANISATION_NAME,
    OSW_ORGANISATION_SLUG: process.env.OSW_ORGANISATION_SLUG
  };
}

function restoreEnv(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
