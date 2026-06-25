import { nowIso } from "@/lib/defaults";
import { approveArticle } from "@/lib/articles/approval";
import type { WorkspaceStore } from "@/lib/storage/storage";
import type {
  ArticleDocument,
  PostGenerationPublishingAction,
  ProjectWordPressConnectionSecret,
  WordPressPostStatus
} from "@/lib/types";
import { applyPublishingDefaults } from "@/lib/publishing/status";
export { markArticleAsScheduled } from "@/lib/publishing/schedule";
import { publishArticleToWordPress } from "@/lib/publishing/wordpress";
export { applyPublishingDefaults, describePostGenerationAction, getArticlePublishingStatus } from "@/lib/publishing/status";

export function markArticleAsNotPublished(article: ArticleDocument): ArticleDocument {
  const next = applyPublishingDefaults(article);
  return {
    ...next,
    status: next.status === "needs_review" ? next.status : next.status === "generated" ? "approved" : next.status,
    publishingStatus: "not_published",
    scheduledPublishAt: null,
    publishingError: null,
    updatedAt: nowIso()
  };
}

export function markArticlePublishingFailed(article: ArticleDocument, message: string): ArticleDocument {
  return {
    ...markArticleAsNotPublished(article),
    publishingError: message
  };
}

export async function publishArticleViaProjectConnection(
  store: WorkspaceStore,
  article: ArticleDocument,
  status: WordPressPostStatus
) {
  const connection = await store.getProjectWordPressConnection(article.projectId);
  if (!connection) {
    throw new Error("Connect WordPress in Project Settings before publishing.");
  }
  const updated = await publishArticleWithConnection(article, connection, status);
  await store.updateArticle(updated);
  return updated;
}

export async function publishArticleWithConnection(
  article: ArticleDocument,
  connection: ProjectWordPressConnectionSecret,
  status: WordPressPostStatus
) {
  const approved = article.status === "needs_review" || article.status === "generated"
    ? approveArticle(article, null)
    : article;
  const published = await publishArticleToWordPress(connection, approved, status);
  const next = applyPublishingDefaults(approved);
  return {
    ...next,
    status: status === "publish" ? "published" : next.status === "generated" ? "approved" : next.status,
    publishingStatus: status === "publish" ? "published" : "draft",
    publishedAt: published.publishedAt,
    wordpressPostId: published.postId,
    wordpressUrl: published.url,
    scheduledPublishAt: null,
    publishingError: null,
    publishing: {
      ...next.publishing,
      wordpress: published
    },
    updatedAt: nowIso()
  } satisfies ArticleDocument;
}

export function shouldAutoPublish(action: PostGenerationPublishingAction | undefined) {
  return action === "publish_draft" || action === "publish_live";
}

export function postGenerationActionToWordPressStatus(action: PostGenerationPublishingAction) {
  return action === "publish_live" ? "publish" : "draft";
}
