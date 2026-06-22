import { NextResponse } from "next/server";
import { toArticleSummary } from "@/lib/articles/summary";
import { markArticleReady } from "@/lib/publishing/workflow";
import { getAccessibleArticle } from "@/lib/server/project-access";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

interface BulkArticleActionBody {
  articleIds?: string[];
  action?: "mark_ready";
}

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const body = await req.json().catch(() => ({})) as BulkArticleActionBody;
  const articleIds = Array.isArray(body.articleIds) ? [...new Set(body.articleIds.map((id) => id.trim()).filter(Boolean))] : [];
  if (!articleIds.length) {
    return NextResponse.json({ error: "Select at least one article." }, { status: 400 });
  }
  if (body.action !== "mark_ready") {
    return NextResponse.json({ error: "Unsupported bulk article action." }, { status: 400 });
  }

  const { store } = createRuntime();
  const updated = [];
  const failed: Array<{ articleId: string; error: string }> = [];

  for (const articleId of articleIds) {
    const article = await getAccessibleArticle(store, articleId);
    if (!article) {
      failed.push({ articleId, error: "Article not found." });
      continue;
    }
    try {
      const next = markArticleReady(article);
      await store.updateArticle(next);
      updated.push(next);
    } catch (error) {
      failed.push({ articleId, error: error instanceof Error ? error.message : "Could not update article." });
    }
  }

  return NextResponse.json({
    updatedArticles: updated,
    updatedSummaries: updated.map(toArticleSummary),
    failed,
    message: updated.length
      ? `${updated.length} article${updated.length === 1 ? "" : "s"} marked ready.`
      : "No articles were updated."
  });
}
