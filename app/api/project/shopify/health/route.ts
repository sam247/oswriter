import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { checkShopifyDestinationHealth } from "@/lib/connectors/shopify/connector";
import { createRuntime } from "@/lib/server/runtime";
import { getAccessibleProject } from "@/lib/server/project-access";
import { nowIso } from "@/lib/defaults";

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const body = await req.json().catch(() => ({})) as { projectId?: string };
    const projectId = body.projectId?.trim();
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required." }, { status: 400 });
    }

    const { store } = await createRuntime();
    const project = await getAccessibleProject(store, projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const existing = await store.getProjectShopifyConnection(projectId);
    if (!existing) {
      return NextResponse.json({ error: "No Shopify connection found for this project." }, { status: 404 });
    }

    const healthResult = await checkShopifyDestinationHealth(existing);

    // Update the secret record.
    const now = nowIso();
    const updatedSecret = {
      ...existing,
      connectionStatus: healthResult.connectionStatus,
      lastValidatedAt: healthResult.lastValidatedAt,
      lastError: healthResult.lastError,
      updatedAt: now,
    };
    await store.saveProjectShopifyConnection(updatedSecret);

    // Update public connection on the project document.
    const updatedProject = {
      ...project,
      publishing: {
        ...project.publishing,
        shopify: {
          ...project.publishing?.shopify,
          shopDomain: existing.shopDomain,
          grantedScopes: existing.grantedScopes,
          availableBlogs: project.publishing?.shopify?.availableBlogs ?? [],
          accessTokenConfigured: true,
          connectionStatus: healthResult.connectionStatus,
          lastValidatedAt: healthResult.lastValidatedAt,
          lastError: healthResult.lastError,
          updatedAt: now,
        },
      },
      updatedAt: now,
    };
    await store.saveProject(updatedProject);

    return NextResponse.json({
      connectionStatus: healthResult.connectionStatus,
      lastValidatedAt: healthResult.lastValidatedAt,
      lastError: healthResult.lastError,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Health check failed." },
      { status: 400 }
    );
  }
}
