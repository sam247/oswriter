import { NextResponse } from "next/server";
import { createDefaultProject, createDefaultSettings, nowIso } from "@/lib/defaults";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

export async function PATCH(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const body = await req.json().catch(() => ({})) as { name?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Project name is required." }, { status: 400 });

  const { store } = createRuntime();
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
  await store.clearProjectData();
  const project = { ...createDefaultProject(), name };
  await store.saveProject(project);
  await store.saveSettings(createDefaultSettings());
  return NextResponse.json({ project });
}

export async function DELETE() {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { store } = createRuntime();
  await store.clearProjectData();
  const project = createDefaultProject();
  await store.saveProject(project);
  await store.saveSettings(createDefaultSettings());
  return NextResponse.json({ project });
}
