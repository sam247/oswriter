import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";
import { updateArticleFromPatch, type ArticlePatch } from "@/lib/server/article-update";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { id } = await context.params;
  const article = await createRuntime().store.getArticleById(id);
  if (!article) return NextResponse.json({ error: "Article not found." }, { status: 404 });
  return NextResponse.json({ article });
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { id } = await context.params;
  const body = await req.json().catch(() => ({})) as ArticlePatch;
  const hasMarkdown = typeof body.markdown === "string";
  const hasTitle = typeof body.title === "string";
  const hasPinned = typeof body.isPinned === "boolean";
  if (!hasMarkdown && !hasTitle && !hasPinned) {
    return NextResponse.json({ error: "Missing article changes." }, { status: 400 });
  }

  const updated = await updateArticleFromPatch(createRuntime().store, id, body);
  if (!updated) return NextResponse.json({ error: "Article not found." }, { status: 404 });

  return NextResponse.json({ article: updated });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { id } = await context.params;
  const { store } = createRuntime();
  const articles = await store.listArticles();
  const article = articles.find((item) => item.id === id);
  if (!article) return NextResponse.json({ error: "Article not found." }, { status: 404 });

  await store.deleteArticle(article.id, article.projectId);
  return NextResponse.json({ ok: true });
}
