import { calculateArticleScores } from "@/lib/scoring/article-scores";
import { NeonStorageProvider } from "@/lib/storage/neon";
import { WorkspaceStore } from "@/lib/storage/storage";
import type { ArticleDocument, AppState, ProjectDocument, QueueJob, ResearchPack } from "@/lib/types";

export interface WriterOsMcpContext {
  store: WorkspaceStore;
}

export function createWriterOsMcpContext() {
  return {
    store: new WorkspaceStore(new NeonStorageProvider())
  };
}

export async function listProjects(context: WriterOsMcpContext) {
  const projects = await context.store.listProjects();
  return {
    projects: projects.map(projectSummary)
  };
}

export async function getProject(context: WriterOsMcpContext, projectId?: string) {
  const resolvedProjectId = await resolveProjectId(context, projectId);
  const state = await context.store.getState(resolvedProjectId);
  return {
    project: projectSummary(state.project),
    settings: {
      targetWords: state.settings.controls.lengthTargetWords,
      styleProfile: state.settings.controls.styleProfile,
      targetTone: state.settings.controls.targetTone,
      includeTldr: state.settings.controls.includeTldr,
      includeFaq: state.settings.controls.includeFaq,
      runEditor: state.settings.controls.runEditor
    },
    counts: projectCounts(state)
  };
}

export async function listArticles(context: WriterOsMcpContext, projectId?: string) {
  const resolvedProjectId = await resolveProjectId(context, projectId);
  const articles = await context.store.listArticles(resolvedProjectId);
  return {
    projectId: resolvedProjectId,
    articles: articles.map(articleSummary)
  };
}

export async function getArticle(context: WriterOsMcpContext, articleId: string, projectId?: string) {
  const { article, research } = await getArticleWithResearch(context, articleId, projectId);
  return {
    article: {
      ...articleSummary(article),
      statusReason: article.statusReason ?? null,
      targetWords: article.targetWords ?? null,
      qualityScore: article.qualityScore,
      researchSummary: article.researchSummary,
      validation: article.validation,
      needsReviewReasons: article.needsReviewReasons,
      timings: article.timings ?? {},
      scores: calculateArticleScores(article, research)
    }
  };
}

export async function getArticleContent(context: WriterOsMcpContext, articleId: string, projectId?: string) {
  const { article } = await getArticleWithResearch(context, articleId, projectId);
  return {
    articleId: article.id,
    projectId: article.projectId,
    title: article.title,
    markdown: article.markdown,
    wordCount: article.wordCount,
    updatedAt: article.updatedAt
  };
}

export async function getArticleResearch(context: WriterOsMcpContext, articleId: string, projectId?: string) {
  const { article, research } = await getArticleWithResearch(context, articleId, projectId);
  return {
    articleId: article.id,
    projectId: article.projectId,
    research: research ? researchSummary(research) : null
  };
}

export async function getArticleSources(context: WriterOsMcpContext, articleId: string, projectId?: string) {
  const { article, research } = await getArticleWithResearch(context, articleId, projectId);
  const accepted = research?.sources ?? article.sources;
  const rejected = research?.rejectedSources ?? [];
  return {
    articleId: article.id,
    projectId: article.projectId,
    accepted: accepted.map(sourceSummary),
    rejected: rejected.map(sourceSummary)
  };
}

export async function getArticleScores(context: WriterOsMcpContext, articleId: string, projectId?: string) {
  const { article, research } = await getArticleWithResearch(context, articleId, projectId);
  return {
    articleId: article.id,
    projectId: article.projectId,
    scores: calculateArticleScores(article, research)
  };
}

export async function listQueueJobs(context: WriterOsMcpContext, projectId?: string) {
  const resolvedProjectId = await resolveProjectId(context, projectId);
  const jobs = await context.store.listJobs(resolvedProjectId);
  return {
    projectId: resolvedProjectId,
    jobs: jobs.map(queueJobSummary)
  };
}

export async function getQueueStatus(context: WriterOsMcpContext, projectId?: string) {
  const resolvedProjectId = await resolveProjectId(context, projectId);
  const [control, jobs, articles] = await Promise.all([
    context.store.getQueueControl(resolvedProjectId),
    context.store.listJobs(resolvedProjectId),
    context.store.listArticles(resolvedProjectId)
  ]);
  const processing = jobs.find((job) => job.status === "processing") ?? null;
  const queued = jobs.filter((job) => job.status === "queued");
  return {
    projectId: resolvedProjectId,
    mode: control.mode,
    owner: control.requestedBy ?? null,
    reason: control.reason ?? null,
    requestedAt: control.requestedAt ?? null,
    stoppedAt: control.stoppedAt ?? null,
    updatedAt: control.updatedAt,
    current: processing ? queueJobSummary(processing) : null,
    progress: queueProgress(jobs, articles),
    nextQueued: queued.slice(0, 10).map(queueJobSummary)
  };
}

export async function getWorkspaceStats(context: WriterOsMcpContext) {
  const activeProjectId = await context.store.getActiveProjectId();
  const projects = await context.store.listProjects();
  const states = await Promise.all(projects.map((project) => context.store.getState(project.id)));
  const totals = states.reduce((acc, state) => {
    const counts = projectCounts(state);
    acc.articles += counts.articles;
    acc.words += counts.words;
    acc.sources += counts.sources;
    acc.queued += counts.queued;
    acc.processing += counts.processing;
    acc.generated += counts.generated;
    acc.needsReview += counts.needsReview;
    acc.failed += counts.failed;
    acc.skipped += counts.skipped;
    return acc;
  }, {
    articles: 0,
    words: 0,
    sources: 0,
    queued: 0,
    processing: 0,
    generated: 0,
    needsReview: 0,
    failed: 0,
    skipped: 0
  });

  return {
    activeProjectId,
    projectCount: projects.length,
    totals,
    projects: states.map((state) => ({
      ...projectSummary(state.project),
      counts: projectCounts(state)
    }))
  };
}

async function resolveProjectId(context: WriterOsMcpContext, projectId?: string) {
  return projectId?.trim() || await context.store.getActiveProjectId();
}

async function getArticleWithResearch(context: WriterOsMcpContext, articleId: string, projectId?: string) {
  const resolvedProjectId = await resolveProjectId(context, projectId);
  const articles = await context.store.listArticles(resolvedProjectId);
  const article = articles.find((item) => item.id === articleId || item.jobId === articleId);
  if (!article) throw new Error(`Article not found: ${articleId}`);
  const research = await context.store.getResearch(article.id, article.projectId);
  return { article, research };
}

function projectSummary(project: ProjectDocument) {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug ?? null,
    organisationId: project.organisationId ?? null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

function articleSummary(article: ArticleDocument) {
  return {
    id: article.id,
    projectId: article.projectId,
    jobId: article.jobId,
    title: article.title,
    status: article.status,
    wordCount: article.wordCount,
    sourceCount: article.sources.length,
    qualityScore: article.qualityScore,
    currentVersionNumber: article.currentVersionNumber ?? null,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt
  };
}

function queueJobSummary(job: QueueJob) {
  return {
    id: job.id,
    projectId: job.projectId,
    articleId: job.articleId,
    title: job.title,
    status: job.status,
    statusReason: job.statusReason ?? null,
    attempts: job.attempts,
    queuePosition: job.queuePosition ?? null,
    fatalError: job.fatalError ?? null,
    needsReviewReasons: job.needsReviewReasons,
    timings: job.timings ?? {},
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

function researchSummary(research: ResearchPack) {
  return {
    id: research.id ?? null,
    projectId: research.projectId ?? null,
    articleId: research.articleId,
    jobId: research.jobId ?? null,
    runNumber: research.runNumber ?? null,
    title: research.title,
    queries: research.queries,
    usefulFacts: research.usefulFacts,
    usefulFactSources: research.usefulFactSources ?? [],
    rejectedFacts: research.rejectedFacts,
    questionsFound: research.questionsFound,
    headingsFound: research.headingsFound,
    authorityScore: research.authorityScore,
    relevanceScore: research.relevanceScore,
    confidence: research.confidence,
    warnings: research.warnings,
    requestIds: research.requestIds,
    durationMs: research.durationMs,
    sourceCount: research.sources.length,
    rejectedSourceCount: research.rejectedSources.length,
    createdAt: research.createdAt
  };
}

function sourceSummary(source: ResearchPack["sources"][number]) {
  return {
    id: source.id,
    title: source.title,
    url: source.url,
    domain: source.domain,
    summary: source.summary ?? null,
    highlights: source.highlights,
    authorityScore: source.authorityScore,
    relevanceScore: source.relevanceScore,
    accepted: source.accepted,
    rejectionReason: source.rejectionReason ?? null
  };
}

function projectCounts(state: AppState) {
  return {
    articles: state.articles.length,
    words: state.articles.reduce((sum, article) => sum + article.wordCount, 0),
    sources: state.articles.reduce((sum, article) => sum + article.sources.length, 0),
    queued: state.jobs.filter((job) => job.status === "queued").length,
    processing: state.jobs.filter((job) => job.status === "processing").length,
    generated: state.articles.filter((article) => article.status === "generated").length,
    needsReview: state.articles.filter((article) => article.status === "needs_review").length,
    failed: state.jobs.filter((job) => job.status === "failed").length,
    skipped: state.jobs.filter((job) => job.status === "skipped").length
  };
}

function queueProgress(jobs: QueueJob[], articles: ArticleDocument[]) {
  const total = jobs.length;
  const completed = articles.filter((article) => article.status === "generated" || article.status === "needs_review").length;
  const failed = jobs.filter((job) => job.status === "failed").length;
  const skipped = jobs.filter((job) => job.status === "skipped").length;
  const processing = jobs.filter((job) => job.status === "processing").length;
  const queued = jobs.filter((job) => job.status === "queued").length;
  return {
    total,
    completed,
    remaining: queued + processing,
    queued,
    processing,
    failed,
    skipped
  };
}
