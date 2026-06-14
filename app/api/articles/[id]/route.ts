import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";
import { countWords } from "@/lib/text";
import { nowIso } from "@/lib/defaults";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { id } = await context.params;
  const body = await req.json().catch(() => ({})) as { markdown?: string };
  if (typeof body.markdown !== "string") {
    return NextResponse.json({ error: "Missing markdown." }, { status: 400 });
  }

  const { store } = createRuntime();
  const articles = await store.listArticles();
  const article = articles.find((item) => item.id === id);
  if (!article) return NextResponse.json({ error: "Article not found." }, { status: 404 });

  const updated = {
    ...article,
    markdown: body.markdown,
    wordCount: countWords(body.markdown),
    updatedAt: nowIso()
  };
  await store.saveArticle(updated);

  return NextResponse.json({ article: updated });
}
