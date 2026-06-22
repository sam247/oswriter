import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPipeline } from "@/lib/defaults";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { WorkspaceStore } from "@/lib/storage/storage";
import type { ArticleDocument } from "@/lib/types";

describe("project state article summaries", () => {
  it("excludes full article content while preserving dedicated full reads", async () => {
    const store = new WorkspaceStore(new MemoryStorageAdapter());
    await store.ensureProject("default");
    const article: ArticleDocument = {
      id: "article-1",
      projectId: "default",
      jobId: "job-1",
      title: "Summary contract",
      status: "generated",
      markdown: "# Private full content\n\nThis must not appear in project state.",
      createdAt: "2026-06-18T12:00:00.000Z",
      updatedAt: "2026-06-18T12:30:00.000Z",
      wordCount: 10,
      qualityScore: 90,
      researchSummary: "Private research detail",
      validation: { pass: true, warnings: [], needsReviewReasons: [], qualityScore: 90, sectionScores: {}, faqScore: 100, seoScore: 90 },
      pipeline: createPipeline(),
      sources: [],
      needsReviewReasons: []
    };
    await store.saveArticle(article);

    const [summary] = (await store.getState("default")).articles;
    assert.deepEqual(Object.keys(summary).sort(), [
      "evidenceScore",
      "id",
      "publishedAt",
      "publishingStatus",
      "qualityScore",
      "researchScore",
      "scheduledPublishAt",
      "status",
      "title",
      "updatedAt",
      "wordCount",
      "wordpressPostId",
      "wordpressUrl"
    ]);
    assert.equal(summary.publishingStatus, "not_published");
    assert.equal(summary.publishedAt, null);
    assert.equal(summary.wordpressPostId, null);
    assert.equal(summary.wordpressUrl, null);
    assert.equal(summary.scheduledPublishAt, null);
    assert.equal("markdown" in summary, false);
    assert.equal("validation" in summary, false);
    assert.equal("sources" in summary, false);

    const fullArticle = await store.getArticle(article.id, article.projectId);
    assert.equal(fullArticle?.markdown, article.markdown);
    assert.equal(fullArticle?.researchSummary, article.researchSummary);
  });
});
