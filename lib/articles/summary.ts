import { calculateArticleScores } from "@/lib/scoring/article-scores";
import { getArticlePublishingStatus } from "@/lib/publishing/status";
import type { ArticleDocument, ArticleSummary } from "@/lib/types";

export function toArticleSummary(article: ArticleDocument): ArticleSummary {
  const scores = calculateArticleScores(article);
  return {
    id: article.id,
    title: article.title,
    qualityScore: scores.quality.score,
    researchScore: scores.research.score,
    evidenceScore: scores.evidence.score,
    wordCount: article.wordCount,
    status: article.status,
    publishingStatus: getArticlePublishingStatus(article),
    publishedAt: article.publishedAt ?? article.publishing?.wordpress?.publishedAt ?? null,
    wordpressPostId: article.wordpressPostId ?? article.publishing?.wordpress?.postId ?? null,
    wordpressUrl: article.wordpressUrl ?? article.publishing?.wordpress?.url ?? null,
    scheduledPublishAt: article.scheduledPublishAt ?? null,
    updatedAt: article.updatedAt
  };
}
