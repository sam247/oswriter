import type { ArticleDocument, DebugDocument, DebugEvent, ModelAdapter, QueueJob, SearchAdapter } from "@/lib/types";
import { createPipeline, DEFAULT_PROJECT_ID, nowIso } from "@/lib/defaults";
import { countWords, slugId } from "@/lib/text";
import { completeStage, failStage, skipStage, startStage } from "@/lib/pipeline";
import { runResearch } from "@/lib/research/research-engine";
import { statusFromReviewReasons } from "@/lib/status";
import { heuristicValidation } from "@/lib/validation/heuristics";
import type { WorkspaceStore } from "@/lib/storage/storage";

export class QueueRunner {
  constructor(
    private readonly store: WorkspaceStore,
    private readonly search: SearchAdapter,
    private readonly model: ModelAdapter
  ) {}

  async addTitles(titles: string[], projectId = DEFAULT_PROJECT_ID) {
    const clean = titles.map((title) => title.trim()).filter(Boolean);
    const now = nowIso();
    const jobs: QueueJob[] = clean.map((title) => {
      const articleId = slugId("article");
      return {
        id: slugId("job"),
        projectId,
        articleId,
        title,
        status: "queued",
        createdAt: now,
        updatedAt: now,
        attempts: 0,
        needsReviewReasons: [],
        pipeline: createPipeline()
      };
    });
    await Promise.all(jobs.map((job) => this.store.saveJob(job)));
    return jobs;
  }

  async retryJob(jobId: string, projectId = DEFAULT_PROJECT_ID) {
    const job = await this.store.getJob(jobId, projectId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    const next: QueueJob = {
      ...job,
      status: "queued",
      updatedAt: nowIso(),
      fatalError: undefined,
      needsReviewReasons: [],
      pipeline: createPipeline()
    };
    await this.store.saveJob(next);
    return next;
  }

  async retryFailed(projectId = DEFAULT_PROJECT_ID) {
    const jobs = await this.store.listJobs(projectId);
    const failed = jobs.filter((job) => job.status === "failed");
    await Promise.all(failed.map((job) => this.retryJob(job.id, projectId)));
    return failed.length;
  }

  async cancelCurrent(projectId = DEFAULT_PROJECT_ID) {
    const jobs = await this.store.listJobs(projectId);
    const current = jobs.find((job) => job.status === "processing");
    if (!current) return null;
    const cancelled: QueueJob = {
      ...current,
      status: "queued",
      updatedAt: nowIso(),
      pipeline: failStage(current.pipeline, "generation", "Cancelled by user; returned to queued.")
    };
    await this.store.saveJob(cancelled);
    return cancelled;
  }

  async reclaimStale(projectId = DEFAULT_PROJECT_ID) {
    const settings = await this.store.getSettings(projectId);
    const cutoff = Date.now() - settings.staleProcessingMinutes * 60_000;
    await this.reconcileSavedArticles(projectId);
    const jobs = await this.store.listJobs(projectId);
    const stale = jobs.filter((job) => job.status === "processing" && new Date(job.updatedAt).getTime() < cutoff);
    await Promise.all(stale.map((job) => this.store.saveJob({
      ...job,
      status: "queued",
      updatedAt: nowIso(),
      pipeline: job.pipeline.map((step) => step.status === "running" ? { ...step, status: "idle", message: "Recovered after stale processing timeout." } : step)
    })));
    return stale.length;
  }

  async reconcileSavedArticles(projectId = DEFAULT_PROJECT_ID) {
    const [jobs, articles] = await Promise.all([
      this.store.listJobs(projectId),
      this.store.listArticles(projectId)
    ]);
    const articlesByJob = new Map(articles.map((article) => [article.jobId, article]));
    const mismatched = jobs.filter((job) => {
      const article = articlesByJob.get(job.id);
      return article && job.status !== article.status;
    });
    await Promise.all(mismatched.map((job) => {
      const article = articlesByJob.get(job.id);
      if (!article) return Promise.resolve();
      return this.store.saveJob({
        ...job,
        status: article.status,
        needsReviewReasons: article.needsReviewReasons,
        pipeline: article.pipeline,
        updatedAt: nowIso(),
        fatalError: undefined
      });
    }));
    return mismatched.length;
  }

  async processNext(projectId = DEFAULT_PROJECT_ID) {
    await this.reclaimStale(projectId);
    const jobs = await this.store.listJobs(projectId);
    const job = jobs.find((item) => item.status === "queued");
    if (!job) return { processed: false, job: null };
    return { processed: true, job: await this.processJob(job) };
  }

  private async processJob(initial: QueueJob) {
    let job: QueueJob = {
      ...initial,
      status: "processing",
      attempts: initial.attempts + 1,
      updatedAt: nowIso(),
      fatalError: undefined
    };
    let debug: DebugDocument = {
      articleId: job.articleId,
      jobId: job.id,
      events: [],
      updatedAt: nowIso()
    };
    const log = (event: Omit<DebugEvent, "at">) => {
      debug = { ...debug, updatedAt: nowIso(), events: [...debug.events, { at: nowIso(), ...event }] };
    };

    await this.store.saveJob(job);
    log({ stage: "queue", level: "info", message: "Job claimed for processing.", data: { attempt: job.attempts } });

    try {
      const settings = await this.store.getSettings(job.projectId);

      job = { ...job, pipeline: startStage(job.pipeline, "research", "Gathering source evidence."), updatedAt: nowIso() };
      await this.store.saveJob(job);
      log({ stage: "research", level: "info", message: "Research started." });
      const research = await runResearch(job.title, job.articleId, this.search);
      await this.store.saveResearch(research, job.projectId);
      job = { ...job, pipeline: completeStage(job.pipeline, "research", { sourceCount: research.sources.length, confidence: research.confidence }), updatedAt: nowIso() };
      await this.store.saveJob(job);
      log({ stage: "research", level: research.warnings.length ? "warn" : "info", message: "Research completed.", data: research.warnings });

      job = { ...job, pipeline: startStage(job.pipeline, "outline", "Using generation prompt structure."), updatedAt: nowIso() };
      job = { ...job, pipeline: completeStage(job.pipeline, "outline", { strategy: "model-guided" }), updatedAt: nowIso() };
      await this.store.saveJob(job);

      job = { ...job, pipeline: startStage(job.pipeline, "generation", "Writing Markdown article."), updatedAt: nowIso() };
      await this.store.saveJob(job);
      let markdown = await this.model.generateArticle({ title: job.title, research, controls: settings.controls });
      job = { ...job, pipeline: completeStage(job.pipeline, "generation", { model: process.env.AI_GENERATION_MODEL ?? "deepseek-v4-flash" }), updatedAt: nowIso() };
      await this.store.saveJob(job);
      log({ stage: "generation", level: "info", message: "Article generation completed.", data: { words: countWords(markdown) } });

      job = { ...job, pipeline: startStage(job.pipeline, "save", "Saving generated article."), updatedAt: nowIso() };
      await this.store.saveJob(job);
      const needsReview = [...research.warnings];
      const validation = heuristicValidation({ title: job.title, markdown, research });
      needsReview.push(...validation.needsReviewReasons);
      const uniqueReasons = [...new Set(needsReview)];
      const finalStatus = statusFromReviewReasons(uniqueReasons);
      let pipeline = completeStage(job.pipeline, "save", { markdownSaved: true });
      pipeline = skipStage(pipeline, "editor", settings.controls.runEditor ? "Deferred to keep queue processing under Vercel timeout." : "AI editor disabled.");
      pipeline = startStage(pipeline, "validation", "Running fast advisory validation.");
      pipeline = completeStage(pipeline, "validation", { warnings: validation.warnings.length, qualityScore: validation.qualityScore, mode: "heuristic" });
      job = {
        ...job,
        status: finalStatus,
        needsReviewReasons: uniqueReasons,
        pipeline,
        updatedAt: nowIso()
      };

      const article = createArticle(job, markdown, uniqueReasons, validation, research);
      await this.store.saveArticle(article);
      log({ stage: "queue", level: finalStatus === "needs_review" ? "warn" : "info", message: `Job completed as ${finalStatus}.`, data: uniqueReasons });
      await this.store.saveJob(job);
      await this.store.saveDebug(debug, job.projectId);
      return job;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed: QueueJob = {
        ...job,
        status: "failed",
        fatalError: message,
        updatedAt: nowIso(),
        pipeline: failRunningStage(job.pipeline, message)
      };
      log({ stage: "queue", level: "error", message: "Technical failure stopped the job.", data: message });
      await this.store.saveJob(failed);
      await this.store.saveDebug(debug, job.projectId);
      return failed;
    }
  }
}

function createArticle(
  job: QueueJob,
  markdown: string,
  needsReviewReasons: string[],
  validation: ArticleDocument["validation"],
  research: Parameters<typeof heuristicValidation>[0]["research"]
): ArticleDocument {
  const now = nowIso();
  const sources = research.sources;
  return {
    id: job.articleId,
    projectId: job.projectId,
    jobId: job.id,
    title: job.title,
    status: job.status === "processing" ? statusFromReviewReasons(needsReviewReasons) : job.status,
    markdown,
    createdAt: job.createdAt,
    updatedAt: now,
    wordCount: countWords(markdown),
    qualityScore: validation.qualityScore,
    researchSummary: research.usefulFacts.slice(0, 5).join(" "),
    validation,
    pipeline: job.pipeline,
    sources,
    needsReviewReasons
  };
}

function failRunningStage(pipeline: QueueJob["pipeline"], message: string) {
  const running = pipeline.find((step) => step.status === "running");
  return running ? failStage(pipeline, running.stage, message) : pipeline;
}
