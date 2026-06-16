import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDefaultProject, createDefaultQueueControl, createDefaultSettings, createPipeline, nowIso } from "@/lib/defaults";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { WorkspaceStore } from "@/lib/storage/storage";
import type { ArticleDocument, QueueJob, ResearchPack } from "@/lib/types";
import {
  getArticleContent,
  getArticleResearch,
  getArticleScores,
  getArticleSources,
  getQueueStatus,
  getWorkspaceStats,
  listArticles,
  listProjects,
  listQueueJobs,
  type WriterOsMcpContext
} from "@/mcp/data";

describe("Writer OS MCP read-only data layer", () => {
  it("exposes projects, articles, research, sources, scores, queue, and workspace stats", async () => {
    const context = await setupMcpContext();

    const projects = await listProjects(context);
    assert.equal(projects.projects.length, 1);
    assert.equal(projects.projects[0].id, "default");

    const articles = await listArticles(context, "default");
    assert.equal(articles.articles.length, 1);
    assert.equal(articles.articles[0].title, "MCP Read Only Article");

    const content = await getArticleContent(context, "article_mcp", "default");
    assert.match(content.markdown, /MCP Read Only Article/);

    const research = await getArticleResearch(context, "article_mcp", "default");
    assert.equal(research.research?.sourceCount, 1);
    assert.equal(research.research?.usefulFacts[0], "MCP clients can inspect Writer OS articles.");

    const sources = await getArticleSources(context, "article_mcp", "default");
    assert.equal(sources.accepted[0].domain, "example.com");

    const scores = await getArticleScores(context, "article_mcp", "default");
    assert.ok(scores.scores.quality.score > 0);

    const jobs = await listQueueJobs(context, "default");
    assert.equal(jobs.jobs.length, 1);
    assert.equal(jobs.jobs[0].status, "generated");

    const queue = await getQueueStatus(context, "default");
    assert.equal(queue.mode, "stopped");
    assert.equal(queue.progress.completed, 1);

    const stats = await getWorkspaceStats(context);
    assert.equal(stats.projectCount, 1);
    assert.equal(stats.totals.articles, 1);
    assert.ok(stats.totals.words > 0);
  });
});

async function setupMcpContext(): Promise<WriterOsMcpContext> {
  const store = new WorkspaceStore(new MemoryStorageAdapter());
  const now = nowIso();
  const project = { ...createDefaultProject(), id: "default", name: "MCP Project", updatedAt: now };
  const job: QueueJob = {
    id: "job_mcp",
    projectId: "default",
    articleId: "article_mcp",
    title: "MCP Read Only Article",
    status: "generated",
    createdAt: now,
    updatedAt: now,
    attempts: 1,
    queuePosition: 1,
    needsReviewReasons: [],
    pipeline: createPipeline(),
    timings: { queued_at: now, completed_at: now }
  };
  const article: ArticleDocument = {
    id: "article_mcp",
    projectId: "default",
    jobId: "job_mcp",
    title: "MCP Read Only Article",
    status: "generated",
    markdown: "# MCP Read Only Article\n\nMCP clients can inspect Writer OS articles with clean JSON.",
    createdAt: now,
    updatedAt: now,
    wordCount: 11,
    qualityScore: 88,
    researchSummary: "MCP read-only research summary.",
    validation: {
      pass: true,
      warnings: [],
      needsReviewReasons: [],
      qualityScore: 88,
      sectionScores: {},
      faqScore: 80,
      seoScore: 80
    },
    pipeline: createPipeline(),
    sources: [source()],
    needsReviewReasons: [],
    timings: { generated_at: now, completed_at: now }
  };
  const research: ResearchPack = {
    id: "research_mcp",
    projectId: "default",
    articleId: "article_mcp",
    jobId: "job_mcp",
    runNumber: 1,
    title: "MCP Read Only Article",
    queries: ["writer os mcp"],
    sources: [source()],
    rejectedSources: [],
    usefulFacts: ["MCP clients can inspect Writer OS articles."],
    usefulFactSources: [],
    rejectedFacts: [],
    questionsFound: [],
    headingsFound: [],
    authorityScore: 82,
    relevanceScore: 84,
    confidence: 86,
    warnings: [],
    requestIds: [],
    durationMs: 1000,
    createdAt: now
  };

  await store.saveProject(project);
  await store.saveSettings({ ...createDefaultSettings(), projectId: "default" });
  await store.saveQueueControl({ ...createDefaultQueueControl("default"), stoppedAt: now, updatedAt: now });
  await store.saveJob(job);
  await store.saveArticle(article);
  await store.saveResearch(research, "default");

  return { store };
}

function source() {
  return {
    id: "source_mcp",
    title: "Writer OS MCP",
    url: "https://example.com/writer-os-mcp",
    domain: "example.com",
    summary: "Writer OS MCP read-only inspection.",
    highlights: ["Read-only inspection"],
    authorityScore: 82,
    relevanceScore: 84,
    accepted: true
  };
}
