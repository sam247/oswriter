import { NextResponse } from "next/server";
import { toArticleSummary } from "@/lib/articles/summary";
import { buildPublishingSchedule, markArticleAsScheduled, schedulePatternLabel } from "@/lib/publishing/schedule";
import { getAccessibleArticle } from "@/lib/server/project-access";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";
import type { PublishingScheduleRequest } from "@/lib/types";

interface BulkArticleActionBody {
  articleIds?: string[];
  action?: "schedule";
  schedule?: PublishingScheduleRequest;
}

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const body = await req.json().catch(() => ({})) as BulkArticleActionBody;
  const articleIds = Array.isArray(body.articleIds) ? [...new Set(body.articleIds.map((id) => id.trim()).filter(Boolean))] : [];
  if (!articleIds.length) {
    return NextResponse.json({ error: "Select at least one article." }, { status: 400 });
  }
  if (body.action !== "schedule") {
    return NextResponse.json({ error: "Unsupported bulk article action." }, { status: 400 });
  }
  if (!body.schedule?.startAt) {
    return NextResponse.json({ error: "Schedule start date and time are required." }, { status: 400 });
  }

  const { store } = createRuntime();
  const updated = [];
  const failed: Array<{ articleId: string; error: string }> = [];
  const scheduleTimes = buildPublishingSchedule(body.schedule.startAt, articleIds.length, {
    pattern: body.schedule.pattern,
    customIntervalValue: body.schedule.customIntervalValue,
    customIntervalUnit: body.schedule.customIntervalUnit
  });

  for (const [index, articleId] of articleIds.entries()) {
    const article = await getAccessibleArticle(store, articleId);
    if (!article) {
      failed.push({ articleId, error: "Article not found." });
      continue;
    }
    try {
      const next = markArticleAsScheduled(article, scheduleTimes[index]);
      await store.updateArticle(next);
      const job = await store.getJob(article.jobId, article.projectId);
      if (job) await store.saveJob({
        ...job,
        status: next.status,
        statusReason: "Scheduled for publishing.",
        updatedAt: next.updatedAt
      });
      updated.push(next);
    } catch (error) {
      failed.push({ articleId, error: error instanceof Error ? error.message : "Could not update article." });
    }
  }

  return NextResponse.json({
    updatedArticles: updated,
    updatedSummaries: updated.map(toArticleSummary),
    failed,
    message: updated.length
      ? `${updated.length} article${updated.length === 1 ? "" : "s"} scheduled (${schedulePatternLabel(body.schedule.pattern)}).`
      : "No articles were updated."
  });
}
