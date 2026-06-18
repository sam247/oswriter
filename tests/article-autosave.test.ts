import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { createPipeline } from "@/lib/defaults";
import { updateArticleFromPatch } from "@/lib/server/article-update";
import { WorkspaceStore, type StorageProvider } from "@/lib/storage/storage";
import type { ArticleDocument } from "@/lib/types";

describe("article autosave", () => {
  it("reads and updates only the requested article", async () => {
    const calls: string[] = [];
    const article = articleFixture();
    let saved: ArticleDocument | null = null;
    const provider: StorageProvider = {
      getJson: async () => { throw new Error("autosave must not resolve project or load state"); },
      putJson: async () => { throw new Error("autosave must use the direct update path"); },
      putJsonIfAbsent: async () => true,
      putText: async () => { throw new Error("autosave must not perform a second markdown write"); },
      listJson: async () => { throw new Error("autosave must not list articles"); },
      listPaths: async () => { throw new Error("autosave must not list project paths"); },
      deletePath: async () => undefined,
      getArticleById: async (articleId) => {
        calls.push(`read:${articleId}`);
        return article;
      },
      updateArticle: async (updated) => {
        calls.push(`update:${updated.id}`);
        saved = updated;
      }
    };

    const updated = await updateArticleFromPatch(new WorkspaceStore(provider), article.id, {
      title: "  Updated title  ",
      markdown: "# Updated title\n\nOne two three four.",
      isPinned: true
    });

    assert.deepEqual(calls, ["read:article-1", "update:article-1"]);
    assert.equal(updated?.title, "Updated title");
    assert.equal(updated?.wordCount, 7);
    assert.equal(updated?.isPinned, true);
    assert.equal((saved as ArticleDocument | null)?.markdown, "# Updated title\n\nOne two three four.");
  });

  it("keeps collection and state reads out of the PATCH handler", async () => {
    const route = await readFile(new URL("../app/api/articles/[id]/route.ts", import.meta.url), "utf8");
    const patchHandler = route.slice(route.indexOf("export async function PATCH"), route.indexOf("export async function DELETE"));
    assert.match(patchHandler, /updateArticleFromPatch/);
    assert.doesNotMatch(patchHandler, /listArticles|getState|getFullState|loadProjectArticles|getResearch|listJobs/);
  });
});

function articleFixture(): ArticleDocument {
  return {
    id: "article-1",
    projectId: "project-1",
    jobId: "job-1",
    title: "Original title",
    status: "generated",
    markdown: "# Original title",
    createdAt: "2026-06-18T12:00:00.000Z",
    updatedAt: "2026-06-18T12:30:00.000Z",
    wordCount: 3,
    qualityScore: 90,
    researchSummary: "Summary",
    validation: { pass: true, warnings: [], needsReviewReasons: [], qualityScore: 90, sectionScores: {}, faqScore: 100, seoScore: 90 },
    pipeline: createPipeline(),
    sources: [],
    needsReviewReasons: []
  };
}
