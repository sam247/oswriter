import { nowIso } from "@/lib/defaults";
import type { ArticleDocument, QueueJob } from "@/lib/types";

export function approveArticle(article: ArticleDocument, approvedBy?: string | null): ArticleDocument {
  const now = nowIso();
  return {
    ...article,
    status: "approved",
    statusReason: "Approved by reviewer.",
    approvedAt: article.approvedAt ?? now,
    approvedBy: article.approvedBy ?? approvedBy ?? null,
    updatedAt: now
  };
}

export function approveArticleJob(job: QueueJob, article: ArticleDocument): QueueJob {
  return {
    ...job,
    status: "approved",
    statusReason: "Approved by reviewer.",
    needsReviewReasons: article.needsReviewReasons,
    updatedAt: article.updatedAt
  };
}
