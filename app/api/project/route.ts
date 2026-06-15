import { NextResponse } from "next/server";
import { createDefaultProject, createDefaultSettings, nowIso } from "@/lib/defaults";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";
import { slugId } from "@/lib/text";
import { getQueueMutationBlocker } from "@/lib/queue/safety";

export async function PATCH(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const body = await req.json().catch(() => ({})) as { activeProjectId?: string; name?: string };
  const { store } = createRuntime();

  const activeProjectId = body.activeProjectId?.trim();
  if (activeProjectId) {
    const projects = await store.listProjects();
    const project = projects.find((item) => item.id === activeProjectId);
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    await store.setActiveProjectId(activeProjectId);
    return NextResponse.json({ project });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Project name is required." }, { status: 400 });

  const { project } = await store.ensureProject();
  const updated = { ...project, name, updatedAt: nowIso() };
  await store.saveProject(updated);
  return NextResponse.json({ project: updated });
}

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const body = await req.json().catch(() => ({})) as { name?: string };
  const name = body.name?.trim() || "Untitled Project";
  const { store } = createRuntime();
  const now = nowIso();
  const projectId = slugId("project");
  const project = { ...createDefaultProject(), id: projectId, name, createdAt: now, updatedAt: now };
  await store.saveProject(project);
  await store.saveSettings({ ...createDefaultSettings(), projectId });
  await store.setActiveProjectId(projectId);
  return NextResponse.json({ project });
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
  return NextResponse.json(result);
}
