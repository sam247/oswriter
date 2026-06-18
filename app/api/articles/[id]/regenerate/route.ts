import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { id } = await context.params;
  const { runner, store } = createRuntime();
  try {
    const result = await runner.regenerateArticle(id);
    return NextResponse.json({ ...result, state: await store.getState(result.article.projectId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Article regeneration failed.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Article not found") ? 404 : 409 });
  }
}
