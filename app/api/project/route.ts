import { NextResponse } from "next/server";
import { createDefaultProject, createDefaultSettings, nowIso } from "@/lib/defaults";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";
import { slugId } from "@/lib/text";
import { getQueueMutationBlocker, getSettingsMutationBlocker } from "@/lib/queue/safety";
import { normalizeProjectProfile } from "@/lib/project/profile";
import { normalizeProjectKnowledgeBase } from "@/lib/project/knowledge-base";
import { normalizeProjectDictionaryTerms } from "@/lib/editor/harper/dictionary";
import type { ProjectKnowledgeBase, ProjectProfile } from "@/lib/types";
import { normalizeContentProfile } from "@/lib/content-profiles";

export async function PATCH(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const body = await req.json().catch(() => ({})) as { activeProjectId?: string; projectId?: string; name?: string; profile?: Partial<ProjectProfile>; knowledgeBase?: Partial<ProjectKnowledgeBase>; defaultContentProfile?: string; projectDictionaryTerms?: string[] };
  const { store } = createRuntime();

  const activeProjectId = body.activeProjectId?.trim();
  if (activeProjectId) {
    const project = await store.getProject(activeProjectId);
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    await store.setActiveProjectId(activeProjectId);
    const state = await store.getState(activeProjectId);
    return NextResponse.json({ project, state });
  }

  const name = body.name?.trim();
  if (!name && !body.profile && !body.knowledgeBase && body.defaultContentProfile === undefined && body.projectDictionaryTerms === undefined) return NextResponse.json({ error: "Project changes are required." }, { status: 400 });
  const targetProjectId = body.projectId?.trim();
  if (body.profile || body.knowledgeBase || body.defaultContentProfile !== undefined || body.projectDictionaryTerms !== undefined) {
    const blocker = await getSettingsMutationBlocker(store, targetProjectId);
    if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });
  }

  const { project } = await store.ensureProject(targetProjectId);
  const settings = await store.getSettings(project.id);
  const updated = {
    ...project,
    ...(name ? { name } : {}),
    ...(body.profile ? { profile: normalizeProjectProfile({ ...project.profile, ...body.profile }, settings.controls.lengthTargetWords) } : {}),
    ...(body.knowledgeBase ? { knowledgeBase: normalizeProjectKnowledgeBase(body.knowledgeBase) } : {}),
    ...(body.defaultContentProfile !== undefined ? { defaultContentProfile: normalizeContentProfile(body.defaultContentProfile) ?? "industry_explainer" } : {}),
    ...(body.projectDictionaryTerms !== undefined ? { projectDictionaryTerms: normalizeProjectDictionaryTerms(body.projectDictionaryTerms) } : {}),
    updatedAt: nowIso()
  };
  await store.saveProject(updated);
  const state = await store.getState();
  return NextResponse.json({ project: updated, state });
}

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const body = await req.json().catch(() => ({})) as { name?: string; profile?: Partial<ProjectProfile>; defaultContentProfile?: string; projectDictionaryTerms?: string[] };
  const name = body.name?.trim() || "Untitled Project";
  const { store } = createRuntime();
  const now = nowIso();
  const projectId = slugId("project");
  const project = {
    ...createDefaultProject(),
    id: projectId,
    name,
    profile: normalizeProjectProfile(body.profile),
    defaultContentProfile: normalizeContentProfile(body.defaultContentProfile) ?? "industry_explainer",
    projectDictionaryTerms: normalizeProjectDictionaryTerms(body.projectDictionaryTerms),
    createdAt: now,
    updatedAt: now
  };
  await store.saveProject(project);
  await store.saveSettings({ ...createDefaultSettings(), projectId });
  await store.setActiveProjectId(projectId);
  const state = await store.getState(projectId);
  return NextResponse.json({ project, state });
}

export async function DELETE(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { store } = createRuntime();
  const body = await req.json().catch(() => ({})) as { projectId?: string };
  const projectId = body.projectId?.trim() || await store.getActiveProjectId();
  const blocker = await getQueueMutationBlocker(store, projectId);
  if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });
  const result = await store.deleteProject(projectId);
  const state = await store.getState(result.project.id);
  return NextResponse.json({ ...result, state });
}
