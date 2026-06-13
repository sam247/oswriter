import { NextResponse } from "next/server";
import { exportArticle, type ArticleExportFormat } from "@/lib/export/exporters";
import { binaryResponseBody } from "@/lib/export/response";
import { requireAuth } from "@/lib/server/auth";
import { createWorkspaceStore } from "@/lib/storage/server";

const articleFormats = new Set(["markdown", "docx", "html", "json"]);

export async function GET(_req: Request, context: { params: Promise<{ id: string; format: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { id, format } = await context.params;
  if (!articleFormats.has(format)) return NextResponse.json({ error: "Unsupported export format." }, { status: 400 });

  const store = createWorkspaceStore();
  const articles = await store.listArticles();
  const article = articles.find((item) => item.id === id);
  if (!article) return NextResponse.json({ error: "Article not found." }, { status: 404 });

  const file = exportArticle(article, format as ArticleExportFormat);
  return new Response(typeof file.body === "string" ? file.body : binaryResponseBody(file.body), {
    headers: downloadHeaders(file.contentType, file.filename)
  });
}

function downloadHeaders(contentType: string, filename: string) {
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store"
  };
}
