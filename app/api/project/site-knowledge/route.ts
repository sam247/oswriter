import { NextResponse } from "next/server";
import { createEmptyProjectSiteKnowledge } from "@/lib/site-knowledge-state";
import { extractProjectSiteProfile } from "@/lib/site-profile";
import { getAccessibleProject } from "@/lib/server/project-access";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { store } = createRuntime();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId")?.trim() || await store.getActiveProjectId();
  const project = await getAccessibleProject(store, projectId);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const siteKnowledge = await store.getProjectSiteKnowledge(projectId);
  let siteProfile = await store.getProjectSiteProfile(projectId);
  if (!siteProfile && siteKnowledge?.pagesIndexed) {
    const pages = await store.listProjectSiteKnowledgePages(projectId);
    siteProfile = extractProjectSiteProfile({
      projectId,
      organisationId: siteKnowledge.organisationId,
      sitemapUrl: siteKnowledge.sitemapUrl,
      pages
    });
    await store.saveProjectSiteProfile(siteProfile);
  }
  return NextResponse.json({
    siteKnowledge: siteKnowledge ?? createEmptyProjectSiteKnowledge(projectId),
    siteProfile,
    projectId
  });
}
