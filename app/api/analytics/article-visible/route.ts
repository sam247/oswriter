import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createWorkspaceStore } from "@/lib/storage/server";
import { nowIso } from "@/lib/defaults";

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const body = await req.json().catch(() => ({})) as { articleId?: string; context?: "state_observed_after_initial_load" | "article_selected" };
  if (!body.articleId) return NextResponse.json({ error: "Missing articleId." }, { status: 400 });

  const store = createWorkspaceStore();
  const articles = await store.listArticles();
  const article = articles.find((item) => item.id === body.articleId);
  if (!article) return NextResponse.json({ error: "Article not found." }, { status: 404 });
  if (article.timings?.visible_at) return NextResponse.json({ recorded: false, visible_at: article.timings.visible_at });

  const visibleAt = nowIso();
  await store.saveArticle({
    ...article,
    timings: { ...article.timings, visible_at: visibleAt, visible_context: body.context ?? "unknown" }
  });

  const job = await store.getJob(article.jobId, article.projectId);
  if (job && !job.timings?.visible_at) {
    await store.saveJob({
      ...job,
      timings: { ...job.timings, visible_at: visibleAt, visible_context: body.context ?? "unknown" }
    });
  }

  return NextResponse.json({ recorded: true, visible_at: visibleAt });
}
