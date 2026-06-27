import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";
import { getAccessibleProject } from "@/lib/server/project-access";
import { nowIso } from "@/lib/defaults";

export async function DELETE(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId")?.trim();
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required." }, { status: 400 });
    }

    const { store } = await createRuntime();
    const project = await getAccessibleProject(store, projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    // Remove the secret row and clear the public connection on the project.
    await store.deleteProjectShopifyConnection(projectId);

    const now = nowIso();
    const { shopify: _removed, ...publishingWithoutShopify } = project.publishing ?? {};
    const updatedProject = {
      ...project,
      publishing: publishingWithoutShopify,
      updatedAt: now,
    };
    await store.saveProject(updatedProject);

    return NextResponse.json({ message: "Shopify publishing destination disconnected." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Disconnect failed." },
      { status: 400 }
    );
  }
}
