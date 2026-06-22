import { nowIso } from "@/lib/defaults";
import type { WorkspaceStore } from "@/lib/storage/storage";
import type {
  ArticleDocument,
  PostGenerationPublishingAction,
  ProjectWordPressConnectionSecret,
  WordPressPostStatus
} from "@/lib/types";
import { applyPublishingDefaults } from "@/lib/publishing/status";
import { publishArticleToWordPress } from "@/lib/publishing/wordpress";
export { applyPublishingDefaults, describePostGenerationAction, getArticlePublishingStatus } from "@/lib/publishing/status";

export function markArticleReady(article: ArticleDocument): ArticleDocument {
  const next = applyPublishingDefaults(article);
  return {
    ...next,
    publishingStatus: "ready",
    scheduledPublishAt: null,
    publishingError: null,
    updatedAt: nowIso()
  };
}

export function markArticleAsDraft(article: ArticleDocument): ArticleDocument {
  const next = applyPublishingDefaults(article);
  return {
    ...next,
    publishingStatus: "draft",
    scheduledPublishAt: null,
    publishingError: null,
    updatedAt: nowIso()
  };
}

export function markArticleAsScheduled(article: ArticleDocument, scheduledAt: string): ArticleDocument {
  const next = applyPublishingDefaults(article);
  return {
    ...next,
    publishingStatus: "scheduled",
    scheduledPublishAt: scheduledAt,
    publishingError: null,
    updatedAt: nowIso()
  };
}

export function markArticlePublishingFailed(article: ArticleDocument, message: string): ArticleDocument {
  const next = applyPublishingDefaults(article);
  return {
    ...next,
    publishingStatus: "failed",
    publishingError: message,
    updatedAt: nowIso()
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
  const published = await publishArticleToWordPress(connection, article, status);
  const next = applyPublishingDefaults(article);
  return {
    ...next,
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
