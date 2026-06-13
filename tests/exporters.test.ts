import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { articleToDocx, createProjectManifest, exportFullProjectPackage, exportProjectZip } from "@/lib/export/exporters";
import type { ArticleDocument, ProjectDocument, QueueJob, ResearchPack } from "@/lib/types";

describe("exporters", () => {
  it("builds project manifests from project state", () => {
    const manifest = createProjectManifest(project, articles, jobs, research);
    assert.equal(manifest.projectName, "Launch Notes");
    assert.equal(manifest.articleCount, 3);
    assert.equal(manifest.generatedCount, 1);
    assert.equal(manifest.reviewCount, 1);
    assert.equal(manifest.failedCount, 1);
    assert.equal(manifest.totalWords, 1800);
    assert.equal(manifest.averageArticleLength, 900);
    assert.equal(manifest.averageAuthority, 81);
    assert.equal(manifest.averageConfidence, 0.88);
  });

  it("exports project ZIPs and DOCX files as ZIP-compatible binaries", () => {
    const markdownZip = exportProjectZip(project, articles, "markdown");
    const docx = articleToDocx(articles[0]);
    assert.equal(signature(markdownZip), "PK\u0003\u0004");
    assert.equal(signature(docx), "PK\u0003\u0004");
    assert.ok(decode(markdownZip).includes("launch-notes/first-article.md"));
    assert.ok(decode(docx).includes("word/document.xml"));
  });

  it("exports a full project package with manifest and every format", () => {
    const manifest = createProjectManifest(project, articles, jobs, research);
    const zip = exportFullProjectPackage(project, articles, manifest);
    const text = decode(zip);
    assert.ok(text.includes("launch-notes/project-manifest.json"));
    assert.ok(text.includes("launch-notes/markdown/first-article.md"));
    assert.ok(text.includes("launch-notes/docx/first-article.docx"));
    assert.ok(text.includes("launch-notes/html/first-article.html"));
    assert.ok(text.includes("launch-notes/json/first-article.json"));
  });
});

function signature(bytes: Uint8Array) {
  return String.fromCharCode(...bytes.slice(0, 4));
}

function decode(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

const project: ProjectDocument = {
  id: "default",
  name: "Launch Notes",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const jobs: QueueJob[] = [
  job("job_1", "article_1", "generated"),
  job("job_2", "article_2", "needs_review"),
  job("job_3", "article_3", "failed")
];

const articles: ArticleDocument[] = [
  article("article_1", "job_1", "First Article", "generated", 1000),
  article("article_2", "job_2", "Second Article", "needs_review", 800)
];

const research: ResearchPack[] = [
  researchPack("article_1", 80, 0.9),
  researchPack("article_2", 82, 0.85)
];

function job(id: string, articleId: string, status: QueueJob["status"]): QueueJob {
  return {
    id,
    projectId: "default",
    articleId,
    title: articleId,
    status,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    attempts: 1,
    needsReviewReasons: [],
    pipeline: []
  };
}

function article(id: string, jobId: string, title: string, status: ArticleDocument["status"], wordCount: number): ArticleDocument {
  return {
    id,
    projectId: "default",
    jobId,
    title,
    status,
    markdown: `# ${title}\n\nBody text.`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    wordCount,
    qualityScore: 90,
    researchSummary: "",
    validation: {
      pass: true,
      warnings: [],
      needsReviewReasons: [],
      qualityScore: 90,
      sectionScores: {},
      faqScore: 90,
      seoScore: 90
    },
    pipeline: [],
    sources: [],
    needsReviewReasons: []
  };
}

function researchPack(articleId: string, authorityScore: number, confidence: number): ResearchPack {
  return {
    articleId,
    title: articleId,
    queries: [],
    sources: [],
    rejectedSources: [],
    usefulFacts: [],
    rejectedFacts: [],
    questionsFound: [],
    headingsFound: [],
    authorityScore,
    relevanceScore: 90,
    confidence,
    warnings: [],
    requestIds: [],
    durationMs: 100,
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}
