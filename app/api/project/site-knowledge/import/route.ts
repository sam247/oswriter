import { getSettingsMutationBlocker } from "@/lib/queue/safety";
import { importSiteKnowledge } from "@/lib/site-knowledge";
import { getAccessibleProject } from "@/lib/server/project-access";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

interface ImportSiteKnowledgeBody {
  projectId?: string;
  sitemapUrl?: string;
}

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const body = await req.json().catch(() => ({})) as ImportSiteKnowledgeBody;
  const { store } = createRuntime();
  const projectId = body.projectId?.trim() || await store.getActiveProjectId();
  const sitemapUrl = body.sitemapUrl?.trim();

  if (!sitemapUrl) {
    return Response.json({ error: "Sitemap URL is required." }, { status: 400 });
  }

  const project = await getAccessibleProject(store, projectId);
  if (!project) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const blocker = await getSettingsMutationBlocker(store, projectId);
  if (blocker) {
    return Response.json({ error: blocker }, { status: 409 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      void (async () => {
        try {
          emit({ type: "started", projectId, sitemapUrl });
          const result = await importSiteKnowledge({
            projectId,
            sitemapUrl,
            store,
            onProgress(siteKnowledge) {
              emit({ type: "progress", siteKnowledge });
            }
          });
          emit({
            type: "complete",
            siteKnowledge: result.siteKnowledge,
            pagesIndexed: result.pages.length
          });
        } catch (error) {
          emit({
            type: "error",
            error: error instanceof Error ? error.message : "Site import failed."
          });
        } finally {
          controller.close();
        }
      })();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
