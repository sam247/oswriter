import { NextResponse } from "next/server";
import { exportProjectZip, safeFilename, type ProjectExportFormat } from "@/lib/export/exporters";
import { binaryResponseBody } from "@/lib/export/response";
import { requireAuth } from "@/lib/server/auth";
import { createWorkspaceStore } from "@/lib/storage/server";

const projectFormats = new Set(["markdown", "docx", "html", "json"]);

export async function GET(_req: Request, context: { params: Promise<{ format: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { format } = await context.params;
  if (!projectFormats.has(format)) return NextResponse.json({ error: "Unsupported export format." }, { status: 400 });

  const store = createWorkspaceStore();
  const { project, articles } = await store.getState();
  const zip = exportProjectZip(project, articles, format as ProjectExportFormat);
  const extension = format === "markdown" ? "md" : format;
  return new Response(binaryResponseBody(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeFilename(project.name)}-${extension}.zip"`,
      "Cache-Control": "no-store"
    }
  });
}
