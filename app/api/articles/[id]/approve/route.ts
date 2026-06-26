import { NextResponse } from "next/server";
import { approveArticle, approveArticleJob } from "@/lib/articles/approval";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { id } = await context.params;
  const { store } = await createRuntime();
  const article = await store.getArticleById(id);
  if (!article) return NextResponse.json({ error: "Article not found." }, { status: 404 });

  const approved = approveArticle(article, null);
  await store.updateArticle(approved);

  const job = await store.getJob(article.jobId, article.projectId);
  if (job) await store.saveJob(approveArticleJob(job, approved));

  return NextResponse.json({ article: approved, message: "Article approved." });
}
