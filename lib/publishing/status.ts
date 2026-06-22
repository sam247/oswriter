import type { ArticleDocument, PostGenerationPublishingAction, PublishingWorkflowStatus } from "@/lib/types";

export function getArticlePublishingStatus(article: Pick<ArticleDocument, "publishingStatus" | "publishing">): PublishingWorkflowStatus {
  if (article.publishingStatus) return article.publishingStatus;
  const status = article.publishing?.wordpress?.status;
  if (status === "publish") return "published";
  if (status === "draft") return "draft";
  return "draft";
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
    case "mark_ready":
      return "Generate + Mark Ready";
    case "publish_draft":
      return "Generate + Publish Draft";
    case "publish_live":
      return "Generate + Publish Live";
    default:
      return "Generate Only";
  }
}
