import { createProjectManifest, exportFullProjectPackage, safeFilename } from "@/lib/export/exporters";
import { binaryResponseBody } from "@/lib/export/response";
import { requireAuth } from "@/lib/server/auth";
import { createWorkspaceStore } from "@/lib/storage/server";

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const store = await createWorkspaceStore();
  const { project, jobs, articles } = await store.getFullState();
  const researchPacks = await Promise.all(articles.map((article) => store.getResearch(article.id)));
  const manifest = createProjectManifest(project, articles, jobs, researchPacks.filter((pack) => pack !== null));
  const zip = exportFullProjectPackage(project, articles, manifest);

  return new Response(binaryResponseBody(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeFilename(project.name)}-package.zip"`,
      "Cache-Control": "no-store"
    }
  });
}
