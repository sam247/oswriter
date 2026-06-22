import type { ArticleDocument, PostGenerationPublishingAction, PublishingWorkflowStatus } from "@/lib/types";

export function getArticlePublishingStatus(article: Pick<ArticleDocument, "publishingStatus" | "publishing">): PublishingWorkflowStatus {
  const rawStatus = article.publishingStatus as string | undefined;
  if (rawStatus) {
    if (rawStatus === "ready" || rawStatus === "failed") return "not_published";
    if (rawStatus === "draft") {
      return article.publishing?.wordpress?.status === "draft" ? "draft" : "not_published";
    }
    return rawStatus as PublishingWorkflowStatus;
  }
  const status = article.publishing?.wordpress?.status;
  if (status === "publish") return "published";
  if (status === "draft") return "draft";
  return "not_published";
}

export function applyPublishingDefaults(article: ArticleDocument): ArticleDocument {
  const status = getArticlePublishingStatus(article);
  const wordpress = article.publishing?.wordpress;
  return {
    ...article,
    publishingStatus: status,
    publishedAt: article.publishedAt ?? wordpress?.publishedAt ?? null,
    wordpressPostId: article.wordpressPostId ?? wordpress?.postId ?? null,
    wordpressUrl: article.wordpressUrl ?? wordpress?.url ?? null,
    scheduledPublishAt: article.scheduledPublishAt ?? null,
    publishingError: article.publishingError ?? null
  };
}

export function describePostGenerationAction(action: PostGenerationPublishingAction) {
  switch (action) {
    case "publish_draft":
      return "Generate + Publish Draft";
    case "publish_live":
      return "Generate + Publish Now";
    default:
      return "Generate Only";
  }
}
