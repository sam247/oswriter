import { NextResponse } from "next/server";
import { nowIso } from "@/lib/defaults";
import { connectionPassword, testWordPressConnection } from "@/lib/publishing/wordpress";
import { encryptSecret } from "@/lib/security/secrets";
import { getAccessibleProject } from "@/lib/server/project-access";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";
import type { ProjectWordPressConnection, ProjectWordPressConnectionSecret, WordPressPostStatus } from "@/lib/types";

interface SaveWordPressConnectionBody {
  projectId?: string;
  siteUrl?: string;
  username?: string;
  applicationPassword?: string;
  defaultPostStatus?: WordPressPostStatus;
  defaultCategory?: string | null;
}

export async function PATCH(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const body = await req.json().catch(() => ({})) as SaveWordPressConnectionBody;
  const projectId = body.projectId?.trim();
  if (!projectId) {
    return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
  }

  const { store } = createRuntime();
  const project = await getAccessibleProject(store, projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const existing = await store.getProjectWordPressConnection(projectId);
  const applicationPassword = body.applicationPassword?.trim() || existingPassword(existing);
  if (!applicationPassword) {
    return NextResponse.json({ error: "Application password is required." }, { status: 400 });
  }

  try {
    const validated = await testWordPressConnection({
      siteUrl: body.siteUrl ?? existing?.siteUrl ?? "",
      username: body.username ?? existing?.username ?? "",
      applicationPassword
    });

    const now = nowIso();
    const publicConnection: ProjectWordPressConnection = {
      siteUrl: validated.siteUrl,
      username: validated.username,
      applicationPasswordConfigured: true,
      connectionStatus: "connected",
      defaultPostStatus: normalizeDefaultPostStatus(body.defaultPostStatus, existing?.defaultPostStatus),
      defaultCategory: normalizeDefaultCategory(body.defaultCategory, existing?.defaultCategory),
      lastValidatedAt: now,
      lastError: null,
      updatedAt: now
    };
    const updatedProject = {
      ...project,
      publishing: {
        ...project.publishing,
        wordpress: publicConnection
      },
      updatedAt: now
    };
    const secret: ProjectWordPressConnectionSecret = {
      projectId: project.id,
      organisationId: project.organisationId,
      createdByUserId: project.createdByUserId,
      siteUrl: publicConnection.siteUrl,
      username: publicConnection.username,
      encryptedApplicationPassword: body.applicationPassword?.trim()
        ? encryptSecret(applicationPassword)
        : existing?.encryptedApplicationPassword ?? encryptSecret(applicationPassword),
      connectionStatus: "connected",
      defaultPostStatus: publicConnection.defaultPostStatus,
      defaultCategory: publicConnection.defaultCategory,
      lastValidatedAt: now,
      lastError: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    await store.saveProject(updatedProject);
    await store.saveProjectWordPressConnection(secret);
    const state = await store.getState(project.id);
    return NextResponse.json({ project: updatedProject, state, message: "Connected" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Connection save failed." }, { status: 400 });
  }
}

function existingPassword(existing: ProjectWordPressConnectionSecret | null) {
  if (!existing) return "";
  return connectionPassword(existing);
}

function normalizeDefaultPostStatus(value?: WordPressPostStatus, fallback?: WordPressPostStatus): WordPressPostStatus {
  return value === "publish" ? "publish" : fallback === "publish" ? "publish" : "draft";
}

function normalizeDefaultCategory(value?: string | null, fallback?: string | null) {
  const normalized = value?.trim();
  if (normalized !== undefined) return normalized || null;
  return fallback ?? null;
}
