import { createProjectManifest } from "@/lib/export/exporters";
import { requireAuth } from "@/lib/server/auth";
import { createWorkspaceStore } from "@/lib/storage/server";

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const store = createWorkspaceStore();
  const { project, jobs, articles } = await store.getFullState();
  const researchPacks = await Promise.all(articles.map((article) => store.getResearch(article.id)));
  const manifest = createProjectManifest(project, articles, jobs, researchPacks.filter((pack) => pack !== null));

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"project-manifest.json\"",
      "Cache-Control": "no-store"
    }
  });
}
