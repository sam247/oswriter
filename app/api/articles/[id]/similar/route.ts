import { NextResponse } from "next/server";
import { generateSimilarArticleTitles } from "@/lib/generation/similar-titles";
import { projectProfileFromControls, snapshotProjectProfile } from "@/lib/project/profile";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { id } = await context.params;
  const { model, store } = await createRuntime();
  const article = await store.getArticle(id);
  if (!article) return NextResponse.json({ error: "Article not found." }, { status: 404 });
  const [project, settings, articles, jobs] = await Promise.all([
    store.getProject(article.projectId),
    store.getSettings(article.projectId),
    store.listArticles(article.projectId),
    store.listJobs(article.projectId)
  ]);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  try {
    const titles = await generateSimilarArticleTitles({
      title: article.title,
      markdown: article.markdown,
      profileSnapshot: snapshotProjectProfile(projectProfileFromControls(project.profile, settings.controls)),
      existingTitles: [...articles.map((item) => item.title), ...jobs.map((job) => job.title)],
      count: 10
    }, model);
    return NextResponse.json({ titles });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Similar title generation failed." }, { status: 502 });
  }
}
