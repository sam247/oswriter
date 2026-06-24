import { NextResponse } from "next/server";
import { BUSINESS_TYPE_OPTIONS, type BusinessTypeKey } from "@/lib/project/profile";
import { getSettingsMutationBlocker } from "@/lib/queue/safety";
import { createEmptyProjectSiteKnowledge } from "@/lib/site-knowledge-state";
import { extractProjectSiteProfile } from "@/lib/site-profile";
import { getAccessibleProject } from "@/lib/server/project-access";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

function normalizedBusinessTypeKey(value: unknown): BusinessTypeKey {
  const keys = new Set<BusinessTypeKey>(BUSINESS_TYPE_OPTIONS.map((option) => option.key));
  return typeof value === "string" && keys.has(value as BusinessTypeKey) ? value as BusinessTypeKey : "auto_detect";
}

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
      pages,
      configuredBusinessType: normalizedBusinessTypeKey(project.profile?.businessTypeKey)
    });
    await store.saveProjectSiteProfile(siteProfile);
  }
  return NextResponse.json({
    siteKnowledge: siteKnowledge ?? createEmptyProjectSiteKnowledge(projectId),
    siteProfile,
    projectId
  });
}

export async function DELETE(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { store } = createRuntime();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId")?.trim() || await store.getActiveProjectId();
  const project = await getAccessibleProject(store, projectId);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const blocker = await getSettingsMutationBlocker(store, projectId);
  if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });

  await store.deleteProjectSiteKnowledge(projectId);
  return NextResponse.json({
    projectId,
    siteKnowledge: createEmptyProjectSiteKnowledge(projectId),
    siteProfile: null
  });
}
