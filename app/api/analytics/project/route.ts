import { NextResponse } from "next/server";
import { buildProjectAnalytics } from "@/lib/analytics/project";
import { requireAuth } from "@/lib/server/auth";
import { createWorkspaceStore } from "@/lib/storage/server";

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const store = createWorkspaceStore();
  const { jobs, articles } = await store.getState();
  const researchPacks = await Promise.all(articles.map((article) => store.getResearch(article.id)));
  return NextResponse.json(buildProjectAnalytics({
    articles,
    jobs,
    researchPacks: researchPacks.filter((pack) => pack !== null)
  }));
}
