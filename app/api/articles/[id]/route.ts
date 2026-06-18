import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";
import { countWords } from "@/lib/text";
import { nowIso } from "@/lib/defaults";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { id } = await context.params;
  const body = await req.json().catch(() => ({})) as { markdown?: string; title?: string; isPinned?: boolean };
  const hasMarkdown = typeof body.markdown === "string";
  const hasTitle = typeof body.title === "string";
  const hasPinned = typeof body.isPinned === "boolean";
  if (!hasMarkdown && !hasTitle && !hasPinned) {
    return NextResponse.json({ error: "Missing article changes." }, { status: 400 });
  }

  const { store } = createRuntime();
  const articles = await store.listArticles();
  const article = articles.find((item) => item.id === id);
  if (!article) return NextResponse.json({ error: "Article not found." }, { status: 404 });

  const updated = {
    ...article,
    title: hasTitle ? body.title!.trim() || article.title : article.title,
    markdown: hasMarkdown ? body.markdown! : article.markdown,
    wordCount: hasMarkdown ? countWords(body.markdown!) : article.wordCount,
    isPinned: hasPinned ? body.isPinned! : article.isPinned ?? false,
    updatedAt: hasMarkdown || hasTitle ? nowIso() : article.updatedAt
  };
  await store.saveArticle(updated);

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
