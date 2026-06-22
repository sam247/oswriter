import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPublishingSchedule } from "@/lib/publishing/schedule";
import { getArticlePublishingStatus } from "@/lib/publishing/status";
import type { ArticleDocument } from "@/lib/types";

describe("publishing workflow simplification", () => {
  it("maps legacy ready and failed publishing states to not_published", () => {
    assert.equal(getArticlePublishingStatus({ publishingStatus: "ready" as ArticleDocument["publishingStatus"], publishing: undefined }), "not_published");
    assert.equal(getArticlePublishingStatus({ publishingStatus: "failed" as ArticleDocument["publishingStatus"], publishing: undefined }), "not_published");
  });

  it("keeps actual WordPress drafts distinct from not_published content", () => {
    assert.equal(getArticlePublishingStatus({
      publishingStatus: "draft",
      publishing: { wordpress: { postId: 12, url: "https://example.com/draft", status: "draft", publishedAt: "2026-06-22T12:00:00.000Z" } }
    }), "draft");
    assert.equal(getArticlePublishingStatus({ publishingStatus: "draft", publishing: undefined }), "not_published");
  });

  it("builds staggered schedules for reusable bulk scheduling", () => {
    const scheduled = buildPublishingSchedule("2026-06-22T09:00:00.000Z", 3, {
      pattern: "one_per_day"
    });
    assert.deepEqual(scheduled, [
      "2026-06-22T09:00:00.000Z",
      "2026-06-23T09:00:00.000Z",
      "2026-06-24T09:00:00.000Z"
    ]);
  });
});
