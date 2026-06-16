import type { ArticleDocument, DebugDocument, DebugEvent, GenerationTelemetryDocument, ModelAdapter, ModelGenerationResult, QueueJob, SearchAdapter } from "@/lib/types";
import { createPipeline, nowIso } from "@/lib/defaults";
import { buildArticleGenerationPlan } from "@/lib/generation/plan";
import { countWords, slugId } from "@/lib/text";
import { completeStage, failStage, skipStage, startStage } from "@/lib/pipeline";
import { runResearch } from "@/lib/research/research-engine";
import { statusFromReviewReasons } from "@/lib/status";
import { roundUsd } from "@/lib/telemetry/costs";
import { heuristicValidation } from "@/lib/validation/heuristics";
import type { WorkspaceStore } from "@/lib/storage/storage";

export class QueueRunner {
  constructor(
    private readonly store: WorkspaceStore,
    private readonly search: SearchAdapter,
    private readonly model: ModelAdapter
  ) {}

  async addTitles(titles: string[], projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const clean = titles.map((title) => title.trim()).filter(Boolean);
    const existingJobs = await this.store.listJobs(resolvedProjectId);
    const processing = existingJobs.some((job) => job.status === "processing");
    const queuedAt = Date.now();
    const jobs: QueueJob[] = clean.map((title, index) => {
      const createdAt = new Date(queuedAt + index).toISOString();
      const articleId = slugId("article");
      return {
        id: slugId("job"),
        projectId: resolvedProjectId,
        articleId,
        title,
        status: "queued",
        createdAt,
        updatedAt: createdAt,
        attempts: 0,
        queuePosition: queuedAt + index,
        needsReviewReasons: [],
        pipeline: createPipeline(),
        timings: { queued_at: createdAt }
      };
    });
    await this.store.saveJobs(jobs);
    if (jobs.length && !processing) {
      const now = nowIso();
      await this.store.saveQueueControl({
        ...await this.store.getQueueControl(resolvedProjectId),
        mode: "stopped",
        requestedBy: null,
        requestedAt: null,
        stoppedAt: now,
        reason: "Queued titles waiting for generation start.",
        updatedAt: now
      });
    }
    return jobs;
  }

  async retryJob(jobId: string, projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const job = await this.store.getJob(jobId, resolvedProjectId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    const next: QueueJob = {
      ...job,
      status: "queued",
      updatedAt: nowIso(),
      queuePosition: await this.nextQueuePosition(resolvedProjectId),
      fatalError: undefined,
      statusReason: null,
      needsReviewReasons: [],
      pipeline: createPipeline(),
      timings: { queued_at: nowIso() }
    };
    await this.store.saveJob(next);
    return next;
  }

  async retryFailed(projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const jobs = await this.store.listJobs(resolvedProjectId);
    const failed = jobs.filter((job) => job.status === "failed");
    await Promise.all(failed.map((job) => this.retryJob(job.id, resolvedProjectId)));
    return failed.length;
  }

  async stopAfterCurrent(projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const jobs = await this.store.listJobs(resolvedProjectId);
    const processing = jobs.find((job) => job.status === "processing");
    const now = nowIso();
    const control = {
      ...await this.store.getQueueControl(resolvedProjectId),
      mode: processing ? "stop_after_current" as const : "stopped" as const,
      requestedBy: "user",
      requestedAt: now,
      stoppedAt: processing ? null : now,
      reason: processing ? "Current article will finish before the queue stops." : "Queue stopped before another article started.",
      updatedAt: now
    };
    await this.store.saveQueueControl(control);
    return control;
  }

  async resumeQueue(projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const now = nowIso();
    const control = {
      ...await this.store.getQueueControl(resolvedProjectId),
      mode: "running" as const,
      requestedBy: "user",
      requestedAt: null,
      stoppedAt: null,
      reason: null,
      updatedAt: now
    };
    await this.store.saveQueueControl(control);
    return control;
  }

  async skipJob(jobId: string, projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const job = await this.store.getJob(jobId, resolvedProjectId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    if (job.status === "processing") throw new Error("Cannot skip the article that is currently processing.");
    if (job.status !== "queued" && job.status !== "failed") throw new Error("Only queued or failed jobs can be skipped.");
    const skipped: QueueJob = {
      ...job,
      status: "skipped",
      statusReason: "Skipped by user.",
      updatedAt: nowIso()
    };
    await this.store.saveJob(skipped);
    return skipped;
  }

  async regenerateLater(jobId: string, projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const job = await this.store.getJob(jobId, resolvedProjectId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    if (job.status === "processing") throw new Error("Cannot move the article that is currently processing.");
    if (job.status !== "queued" && job.status !== "failed" && job.status !== "skipped") throw new Error("Only queued, failed or skipped jobs can be regenerated later.");
    const now = nowIso();
    const next: QueueJob = {
      ...job,
      status: "queued",
      statusReason: "Moved to end of queue for later regeneration.",
      queuePosition: await this.nextQueuePosition(resolvedProjectId),
      updatedAt: now,
      fatalError: undefined,
      timings: { ...job.timings, queued_at: now }
    };
    await this.store.saveJob(next);
    return next;
  }

  async moveJob(jobId: string, direction: "up" | "down" | "top" | "bottom", projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const jobs = (await this.store.listJobs(resolvedProjectId)).filter((job) => job.status === "queued");
    const index = jobs.findIndex((job) => job.id === jobId);
    if (index < 0) throw new Error("Only queued jobs can be reordered.");
    const targetIndex = direction === "top" ? 0 : direction === "bottom" ? jobs.length - 1 : direction === "up" ? Math.max(0, index - 1) : Math.min(jobs.length - 1, index + 1);
    const reordered = [...jobs];
    const [job] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, job);
    const base = Date.now();
    const updated = reordered.map((item, order) => ({
      ...item,
      queuePosition: base + order,
      updatedAt: nowIso()
    }));
    await this.store.saveJobs(updated);
    return updated.find((item) => item.id === jobId) ?? job;
  }

  async cancelCurrent(projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const jobs = await this.store.listJobs(resolvedProjectId);
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

  async reclaimStale(projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const settings = await this.store.getSettings(resolvedProjectId);
    const cutoff = Date.now() - settings.staleProcessingMinutes * 60_000;
    await this.reconcileSavedArticles(resolvedProjectId);
    const jobs = await this.store.listJobs(resolvedProjectId);
    const stale = jobs.filter((job) => job.status === "processing" && new Date(job.updatedAt).getTime() < cutoff);
    await Promise.all(stale.map((job) => this.store.saveJob({
      ...job,
      status: "queued",
      updatedAt: nowIso(),
      pipeline: job.pipeline.map((step) => step.status === "running" ? { ...step, status: "idle", message: "Recovered after stale processing timeout." } : step)
    })));
    return stale.length;
  }

  async reconcileSavedArticles(projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const [jobs, articles] = await Promise.all([
      this.store.listJobs(resolvedProjectId),
      this.store.listArticles(resolvedProjectId)
    ]);
    const articlesByJob = new Map(articles.map((article) => [article.jobId, article]));
    const mismatched = jobs.filter((job) => {
      const article = articlesByJob.get(job.id);
      return article && job.status !== article.status;
    });
    await Promise.all(mismatched.map((job) => {
      const article = articlesByJob.get(job.id);
      if (!article) return Promise.resolve();
      const reconciledAt = nowIso();
      return this.store.saveJob({
        ...job,
        status: article.status,
        needsReviewReasons: article.needsReviewReasons,
        pipeline: article.pipeline,
        timings: { ...article.timings, state_reconciled_at: article.timings?.state_reconciled_at ?? reconciledAt },
        updatedAt: reconciledAt,
        fatalError: undefined
      });
    }));
    return mismatched.length;
  }

  async processNext(projectId?: string, context: { source?: "manual" | "worker" } = {}) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    await this.reclaimStale(resolvedProjectId);
    const jobs = await this.store.listJobs(resolvedProjectId);
    const processing = jobs.find((item) => item.status === "processing");
    if (processing && !canContinueProcessing(processing, context.source)) {
      return { processed: false, job: processing };
    }
    const control = await this.store.getQueueControl(resolvedProjectId);
    if (!processing && control.mode !== "running") {
      return { processed: false, job: null };
    }
    const job = processing ?? jobs.find((item) => item.status === "queued");
    if (!job) {
      await this.markStoppedIfQueueEmpty(resolvedProjectId);
      return { processed: false, job: null };
    }
    return { processed: true, job: await this.processJobStep(job, context) };
  }

  private async processJobStep(initial: QueueJob, context: { source?: "manual" | "worker" }) {
    const startedAt = nowIso();
    let job: QueueJob = {
      ...initial,
      status: "processing",
      attempts: initial.status === "queued" ? initial.attempts + 1 : initial.attempts,
      updatedAt: startedAt,
      fatalError: undefined,
      timings: {
        ...initial.timings,
        queued_at: initial.timings?.queued_at ?? initial.createdAt,
        started_at: initial.timings?.started_at ?? startedAt,
        processing_at: initial.timings?.processing_at ?? startedAt,
        started_by: initial.timings?.started_by ?? context.source ?? "unknown"
      }
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
      const plan = buildArticleGenerationPlan(settings.controls);

      if (!stageDone(job, "research")) {
        job = { ...job, timings: markTiming(job.timings, "research_started_at"), pipeline: startStage(job.pipeline, "research", "Gathering source evidence."), updatedAt: nowIso() };
        await this.store.saveJob(job);
        log({ stage: "research", level: "info", message: "Research started." });
        const research = await runResearch(job.title, job.articleId, this.search);
        await this.store.saveResearch(research, job.projectId);
        job = { ...job, timings: markTiming(job.timings, "research_completed_at"), pipeline: completeStage(job.pipeline, "research", { sourceCount: research.sources.length, confidence: research.confidence }), updatedAt: nowIso() };
        await this.store.saveJob(job);
        log({ stage: "research", level: research.warnings.length ? "warn" : "info", message: "Research completed.", data: research.warnings });
        await this.store.saveDebug(debug, job.projectId);
        return job;
      }

      if (!stageDone(job, "outline")) {
        job = { ...job, timings: markTiming(job.timings, "outline_started_at"), pipeline: startStage(job.pipeline, "outline", "Using generation prompt structure."), updatedAt: nowIso() };
        job = {
          ...job,
          timings: markTiming(job.timings, "outline_completed_at"),
          pipeline: completeStage(job.pipeline, "outline", {
            strategy: "target-guided",
            targetWords: plan.targetWords,
            h2SectionCount: plan.h2SectionCount,
            wordsPerSection: plan.wordsPerSection
          }),
          updatedAt: nowIso()
        };
        await this.store.saveJob(job);
        log({ stage: "outline", level: "info", message: "Outline stage prepared." });
        await this.store.saveDebug(debug, job.projectId);
        return job;
      }

      const research = await this.store.getResearch(job.articleId, job.projectId);
      if (!research) throw new Error("Research unavailable after research stage.");

      job = { ...job, timings: markTiming(job.timings, "generation_started_at"), pipeline: startStage(job.pipeline, "generation", "Writing Markdown article."), updatedAt: nowIso() };
      await this.store.saveJob(job);
      const generation = normaliseGenerationResult(await this.model.generateArticle({ title: job.title, research, controls: settings.controls, plan }));
      const markdown = generation.markdown;
      job = {
        ...job,
        timings: markTiming(job.timings, "generation_completed_at"),
        pipeline: completeStage(job.pipeline, "generation", {
          model: generation.model ?? process.env.AI_GENERATION_MODEL ?? "deepseek-v4-flash",
          finishReason: generation.finishReason ?? null,
          outputTokens: generation.outputTokens ?? 0,
          maxOutputTokens: plan.maxOutputTokens
        }),
        updatedAt: nowIso()
      };
      await this.store.saveJob(job);
      log({ stage: "generation", level: "info", message: "Article generation completed.", data: { words: countWords(markdown) } });

      job = { ...job, timings: markTiming(job.timings, "save_started_at"), pipeline: startStage(job.pipeline, "save", "Saving generated article."), updatedAt: nowIso() };
      await this.store.saveJob(job);
      const needsReview = [...research.warnings];
      const validation = heuristicValidation({ title: job.title, markdown, research, controls: settings.controls, targetWords: plan.targetWords });
      needsReview.push(...validation.needsReviewReasons);
      const uniqueReasons = [...new Set(needsReview)];
      const finalStatus = statusFromReviewReasons(uniqueReasons);
      job = { ...job, timings: markTiming(job.timings, "save_completed_at") };
      let pipeline = completeStage(job.pipeline, "save", { markdownSaved: true });
      pipeline = skipStage(pipeline, "editor", settings.controls.runEditor ? "Deferred to keep queue processing under Vercel timeout." : "AI editor disabled.");
      job = { ...job, timings: markTiming(job.timings, "validation_started_at") };
      pipeline = startStage(pipeline, "validation", "Running fast advisory validation.");
      job = { ...job, timings: markTiming(job.timings, "validation_completed_at") };
      pipeline = completeStage(pipeline, "validation", { warnings: validation.warnings.length, qualityScore: validation.qualityScore, mode: "heuristic" });
      const completedAt = nowIso();
      job = {
        ...job,
        status: finalStatus,
        needsReviewReasons: uniqueReasons,
        pipeline,
        timings: {
          ...job.timings,
          generated_at: completedAt,
          completed_at: completedAt
        },
        updatedAt: completedAt
      };

      const article = createArticle(job, markdown, uniqueReasons, validation, research, plan.targetWords);
      await this.store.saveArticle(article);
      await this.saveGenerationTelemetry(job, research, generation, log);
      log({ stage: "queue", level: finalStatus === "needs_review" ? "warn" : "info", message: `Job completed as ${finalStatus}.`, data: uniqueReasons });
      await this.store.saveJob(job);
      await this.store.saveDebug(debug, job.projectId);
      await this.markStoppedIfRequested(job.projectId);
      await this.markStoppedIfQueueEmpty(job.projectId);
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
      await this.markStoppedIfRequested(job.projectId);
      await this.markStoppedIfQueueEmpty(job.projectId);
      return failed;
    }
  }

  private async nextQueuePosition(projectId: string) {
    const jobs = await this.store.listJobs(projectId);
    const last = jobs.reduce((max, job) => Math.max(max, job.queuePosition ?? new Date(job.createdAt).getTime()), 0);
    return Math.max(Date.now(), last + 1);
  }

  private async saveGenerationTelemetry(
    job: QueueJob,
    research: Parameters<typeof heuristicValidation>[0]["research"],
    generation: ModelGenerationResult,
    log: (event: Omit<DebugEvent, "at">) => void
  ) {
    const now = nowIso();
    const aiCost = generation.estimatedAiCostUsd ?? 0;
    const researchCost = research.estimatedResearchCostUsd ?? 0;
    const telemetry: GenerationTelemetryDocument = {
      projectId: job.projectId,
      articleId: job.articleId,
      jobId: job.id,
      model: generation.model ?? process.env.AI_GENERATION_MODEL ?? "deepseek-v4-flash",
      inputTokens: generation.inputTokens ?? 0,
      outputTokens: generation.outputTokens ?? 0,
      estimatedAiCostUsd: aiCost,
      exaSearchCalls: research.exaSearchCalls ?? research.queries.length,
      exaContentCalls: research.exaContentCalls ?? research.requestIds.length,
      estimatedResearchCostUsd: researchCost,
      totalCostUsd: roundUsd(aiCost + researchCost),
      generationDurationMs: durationMs(job.timings?.generation_started_at, job.timings?.generation_completed_at),
      metadata: {
        status: job.status,
        finishReason: generation.finishReason ?? null,
        researchRunId: research.id ?? null,
        researchRequestIds: research.requestIds,
        sourceCount: research.sources.length
      },
      createdAt: now,
      updatedAt: now
    };

    try {
      await this.store.saveGenerationTelemetry(telemetry);
      log({ stage: "generation", level: "info", message: "Generation telemetry recorded.", data: { totalCostUsd: telemetry.totalCostUsd } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log({ stage: "generation", level: "warn", message: "Generation telemetry failed without blocking article save.", data: message });
      console.warn("generation telemetry failed", { projectId: job.projectId, articleId: job.articleId, error: message });
    }
  }

  private async markStoppedIfRequested(projectId: string) {
    const control = await this.store.getQueueControl(projectId);
    if (control.mode !== "stop_after_current") return;
    const now = nowIso();
    await this.store.saveQueueControl({
      ...control,
      mode: "stopped",
      stoppedAt: now,
      reason: "Current article completed. Queue stopped before the next item.",
      updatedAt: now
    });
  }

  private async markStoppedIfQueueEmpty(projectId: string) {
    const control = await this.store.getQueueControl(projectId);
    if (control.mode !== "running") return;
    const active = (await this.store.listJobs(projectId)).some((job) => job.status === "queued" || job.status === "processing");
    if (active) return;
    const now = nowIso();
    await this.store.saveQueueControl({
      ...control,
      mode: "stopped",
      stoppedAt: now,
      reason: "Queue completed.",
      updatedAt: now
    });
  }
}

function normaliseGenerationResult(result: string | ModelGenerationResult): ModelGenerationResult {
  if (typeof result === "string") {
    return {
      markdown: result,
      model: process.env.AI_GENERATION_MODEL ?? "deepseek-v4-flash",
      inputTokens: 0,
      outputTokens: 0,
      finishReason: null,
      estimatedAiCostUsd: 0
    };
  }
  return {
    ...result,
    model: result.model ?? process.env.AI_GENERATION_MODEL ?? "deepseek-v4-flash",
    inputTokens: result.inputTokens ?? 0,
    outputTokens: result.outputTokens ?? 0,
    finishReason: result.finishReason ?? null,
    estimatedAiCostUsd: result.estimatedAiCostUsd ?? 0
  };
}

function durationMs(start?: string, end?: string) {
  if (!start || !end) return null;
  const duration = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(duration) ? Math.max(0, duration) : null;
}

function stageDone(job: QueueJob, stage: QueueJob["pipeline"][number]["stage"]) {
  return job.pipeline.find((step) => step.stage === stage)?.status === "done";
}

function canContinueProcessing(job: QueueJob, source: "manual" | "worker" | undefined) {
  if (job.status !== "processing") return true;
  const owner = job.timings?.started_by;
  if (!owner || owner === "unknown" || !source) return true;
  return owner === source;
}

function createArticle(
  job: QueueJob,
  markdown: string,
  needsReviewReasons: string[],
  validation: ArticleDocument["validation"],
  research: Parameters<typeof heuristicValidation>[0]["research"],
  targetWords?: number
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
    targetWords,
    qualityScore: validation.qualityScore,
    researchSummary: research.usefulFacts.slice(0, 5).join(" "),
    validation,
    pipeline: job.pipeline,
    sources,
    needsReviewReasons,
    timings: {
      ...job.timings,
      queued_at: job.timings?.queued_at ?? job.createdAt,
      completed_at: job.timings?.completed_at ?? now,
      generated_at: job.timings?.generated_at ?? now
    }
  };
}

function markTiming(timings: QueueJob["timings"], key: keyof NonNullable<QueueJob["timings"]>) {
  return { ...timings, [key]: nowIso() };
}

function failRunningStage(pipeline: QueueJob["pipeline"], message: string) {
  const running = pipeline.find((step) => step.status === "running");
  return running ? failStage(pipeline, running.stage, message) : pipeline;
}
