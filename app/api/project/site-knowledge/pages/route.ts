import { NextResponse } from "next/server";
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

  const pages = await store.listProjectSiteKnowledgePages(projectId);
  return NextResponse.json({ pages, projectId });
}
