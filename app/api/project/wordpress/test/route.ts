import { NextResponse } from "next/server";
import { connectionPassword, testWordPressConnection } from "@/lib/publishing/wordpress";
import { getAccessibleProject } from "@/lib/server/project-access";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

interface TestWordPressConnectionBody {
  projectId?: string;
  siteUrl?: string;
  username?: string;
  applicationPassword?: string;
}

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const body = await req.json().catch(() => ({})) as TestWordPressConnectionBody;
    const projectId = body.projectId?.trim();
    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
    }

    const { store } = await createRuntime();
    const project = await getAccessibleProject(store, projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const existing = await store.getProjectWordPressConnection(projectId);
    const applicationPassword = body.applicationPassword?.trim() || (existing ? connectionPassword(existing) : "");
    if (!applicationPassword) {
      return NextResponse.json({ error: "Application password is required to test this connection." }, { status: 400 });
    }

    const validated = await testWordPressConnection({
      siteUrl: body.siteUrl ?? existing?.siteUrl ?? "",
      username: body.username ?? existing?.username ?? "",
      applicationPassword
    });
    return NextResponse.json({
      ok: true,
      status: "connected",
      message: "Connection succeeded.",
      siteUrl: validated.siteUrl,
      username: validated.username
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      status: "failed",
      error: error instanceof Error ? error.message : "Connection failed."
    }, { status: 400 });
  }
}
