import { NextResponse } from "next/server";
import { publishArticleViaProjectConnection } from "@/lib/publishing/workflow";
import { getAccessibleArticle } from "@/lib/server/project-access";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";
import type { WordPressPostStatus } from "@/lib/types";

interface PublishArticleBody {
  status?: WordPressPostStatus;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { id } = await context.params;
  const body = await req.json().catch(() => ({})) as PublishArticleBody;
  const status = body.status === "publish" ? "publish" : body.status === "draft" ? "draft" : null;
  if (!status) {
    return NextResponse.json({ error: "Publish status must be draft or publish." }, { status: 400 });
  }

  const { store } = createRuntime();
  const article = await getAccessibleArticle(store, id);
  if (!article) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }
  try {
    const updated = await publishArticleViaProjectConnection(store, article, status);
    return NextResponse.json({
      article: updated,
      message: status === "draft" ? "Draft published successfully" : "Article published successfully"
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Publish failed." }, { status: 400 });
  }
}
