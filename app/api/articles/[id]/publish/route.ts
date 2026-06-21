import { NextResponse } from "next/server";
import { nowIso } from "@/lib/defaults";
import { publishArticleToWordPress } from "@/lib/publishing/wordpress";
import { getAccessibleArticle, getAccessibleProject } from "@/lib/server/project-access";
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

  const project = await getAccessibleProject(store, article.projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const connection = await store.getProjectWordPressConnection(project.id);
  if (!connection) {
    return NextResponse.json({ error: "Connect WordPress in Project Settings before publishing." }, { status: 409 });
  }

  try {
    const published = await publishArticleToWordPress(connection, article, status);
    const updated = {
      ...article,
      publishing: {
        ...article.publishing,
        wordpress: published
      },
      updatedAt: nowIso()
    };
    await store.updateArticle(updated);
    return NextResponse.json({
      article: updated,
      message: status === "draft" ? "Draft published successfully" : "Article published successfully"
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Publish failed." }, { status: 400 });
  }
}
