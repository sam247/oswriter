import { calculateArticleScores } from "@/lib/scoring/article-scores";
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
    updatedAt: article.updatedAt
  };
}
