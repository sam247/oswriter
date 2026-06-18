import type { ArticleDocument, DebugDocument, DebugEvent, GenerationTelemetryDocument, ModelAdapter, ModelGenerationResult, QueueJob, SearchAdapter } from "@/lib/types";
import { createPipeline, nowIso } from "@/lib/defaults";
import { buildArticleGenerationPlan, buildPlanningDiagnostics } from "@/lib/generation/plan";
import { countWords, slugId } from "@/lib/text";
import { completeStage, failStage, skipStage, startStage } from "@/lib/pipeline";
import { runResearch } from "@/lib/research/research-engine";
import { statusFromReviewReasons } from "@/lib/status";
import { estimatedExaContentCostUsd, estimatedExaSearchCostUsd, estimateGenerationCost, estimateResearchCostUsd, roundUsd } from "@/lib/telemetry/costs";
import { pricingForModel } from "@/lib/telemetry/pricing";
import { exportArticleTelemetry } from "@/lib/telemetry/sheets-export";
import { calculateTelemetryQuality } from "@/lib/telemetry/quality";
import { projectProfileFromControls, snapshotProjectProfile } from "@/lib/project/profile";
import { normalizeProjectKnowledgeBase } from "@/lib/project/knowledge-base";
import { heuristicValidation } from "@/lib/validation/heuristics";
import type { WorkspaceStore } from "@/lib/storage/storage";

const EMERGENCY_STOP_REASON = "Emergency stopped by user.";

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

  async addUniqueTitles(titles: string[], projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const [articles, jobs] = await Promise.all([
      this.store.listArticles(resolvedProjectId),
      this.store.listJobs(resolvedProjectId)
    ]);
    const blocked = new Set([...articles.map((article) => article.title), ...jobs.map((job) => job.title)].map(normalizeTitle));
    const unique = titles.filter((title) => {
      const key = normalizeTitle(title);
      if (!key || blocked.has(key)) return false;
      blocked.add(key);
      return true;
    });
    return this.addTitles(unique, resolvedProjectId);
  }

  async regenerateArticle(articleId: string, projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const article = await this.store.getArticle(articleId, resolvedProjectId);
    if (!article) throw new Error(`Article not found: ${articleId}`);
    const [job] = await this.addTitles([article.title], resolvedProjectId);
    const updatedArticle: ArticleDocument = {
      ...article,
      status: "needs_review",
      statusReason: "Regeneration requested; original retained for comparison.",
      needsReviewReasons: [...new Set([...article.needsReviewReasons, "Regeneration requested; compare with the new article."])],
      updatedAt: nowIso()
    };
    await this.store.saveArticle(updatedArticle);
    return { article: updatedArticle, job };
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

  async removeQueuedJob(jobId: string, projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const job = await this.store.getJob(jobId, resolvedProjectId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    if (job.status !== "queued") throw new Error("Only queued jobs can be removed.");
    await this.store.deleteJob(jobId, resolvedProjectId);
    return jobId;
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
    return this.emergencyStop(projectId);
  }

  async emergencyStop(projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const jobs = await this.store.listJobs(resolvedProjectId);
    const current = jobs.find((job) => job.status === "processing") ?? jobs.find(isResumableQueuedJob) ?? null;
    const now = nowIso();
    await this.store.saveQueueControl({
      ...await this.store.getQueueControl(resolvedProjectId),
      mode: "stopped",
      requestedBy: "user",
      requestedAt: now,
      stoppedAt: now,
      reason: EMERGENCY_STOP_REASON,
      updatedAt: now
    });
    await this.store.deleteWorkerLease(resolvedProjectId);
    if (!current) return null;
    const cancelled: QueueJob = {
      ...current,
      status: "failed",
      statusReason: EMERGENCY_STOP_REASON,
      fatalError: EMERGENCY_STOP_REASON,
      updatedAt: now,
      pipeline: failCurrentOrNextStage(current.pipeline, EMERGENCY_STOP_REASON),
      timings: {
        ...current.timings,
        completed_at: now
      }
    };
    await this.store.saveJob(cancelled);
    return cancelled;
  }

  async reclaimStale(projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const settings = await this.store.getSettings(resolvedProjectId);
    const cutoff = new Date(Date.now() - settings.staleProcessingMinutes * 60_000).toISOString();
    await this.reconcileSavedArticles(resolvedProjectId);
    const stale = await this.store.getStaleProcessingJobs(cutoff, resolvedProjectId);
    await Promise.all(stale.map(async (job) => {
      const article = await this.store.getArticle(job.articleId, resolvedProjectId);
      if (article && job.status !== article.status) {
        await this.store.saveJob(reconciledJob(job, article));
        return;
      }
      await this.store.saveJob({
        ...job,
        status: "queued",
        updatedAt: nowIso(),
        pipeline: job.pipeline.map((step) => step.status === "running" ? { ...step, status: "idle", message: "Recovered after stale processing timeout." } : step)
      });
    }));
    return stale.length;
  }

  async reconcileSavedArticles(projectId?: string) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    const job = await this.store.getActiveProcessingJob(resolvedProjectId);
    if (!job) return 0;
    const article = await this.store.getArticle(job.articleId, resolvedProjectId);
    if (!article || job.status === article.status) return 0;
    await this.store.saveJob(reconciledJob(job, article));
    return 1;
  }

  async processNext(projectId?: string, context: { source?: "manual" | "worker" } = {}) {
    const resolvedProjectId = projectId ?? await this.store.getActiveProjectId();
    await this.reclaimStale(resolvedProjectId);
    const processing = await this.store.getActiveProcessingJob(resolvedProjectId);
    if (processing && !canContinueProcessing(processing, context.source)) {
      return { processed: false, job: processing };
    }
    const control = await this.store.getQueueControl(resolvedProjectId);
    const resumableCurrent = processing ? null : await this.store.getResumableQueuedJob(resolvedProjectId);
    if (!processing && control.mode === "stop_after_current" && !resumableCurrent) {
      return { processed: false, job: null };
    }
    if (!processing && control.mode !== "running" && control.mode !== "stop_after_current") {
      return { processed: false, job: null };
    }
    const job = processing ?? (control.mode === "stop_after_current" ? resumableCurrent : await this.store.getNextQueuedJob(resolvedProjectId));
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
      await this.throwIfEmergencyStopped(job.projectId);
      const { project, settings } = await this.store.ensureProject(job.projectId);
      const projectProfile = projectProfileFromControls(project.profile, settings.controls);
      const profileSnapshot = snapshotProjectProfile(projectProfile);
      const knowledgeBase = normalizeProjectKnowledgeBase(project.knowledgeBase);
      const plan = buildArticleGenerationPlan(settings.controls, profileSnapshot, knowledgeBase);

      if (!stageDone(job, "research")) {
        await this.throwIfEmergencyStopped(job.projectId);
        job = { ...job, timings: markTiming(job.timings, "research_started_at"), pipeline: startStage(job.pipeline, "research", "Gathering source evidence."), updatedAt: nowIso() };
        await this.store.saveJob(job);
        log({ stage: "research", level: "info", message: "Research started." });
        const research = await runResearch(job.title, job.articleId, this.search, profileSnapshot);
        await this.store.saveResearch(research, job.projectId);
        job = { ...job, timings: markTiming(job.timings, "research_completed_at"), pipeline: completeStage(job.pipeline, "research", { sourceCount: research.sources.length, confidence: research.confidence }), updatedAt: nowIso() };
        await this.store.saveJob(job);
        log({ stage: "research", level: research.warnings.length ? "warn" : "info", message: "Research completed.", data: research.warnings });
        await this.store.saveDebug(debug, job.projectId);
        return job;
      }

      if (!stageDone(job, "outline")) {
        await this.throwIfEmergencyStopped(job.projectId);
        job = { ...job, timings: markTiming(job.timings, "outline_started_at"), pipeline: startStage(job.pipeline, "outline", "Using generation prompt structure."), updatedAt: nowIso() };
        job = {
          ...job,
          timings: markTiming(job.timings, "outline_completed_at"),
          pipeline: completeStage(job.pipeline, "outline", {
            strategy: "target-guided",
            targetWords: plan.targetWords,
            h2SectionCount: plan.h2SectionCount,
            h3SectionCount: plan.h3SectionCount,
            expectedDepth: plan.expectedDepth,
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

      await this.throwIfEmergencyStopped(job.projectId);
      job = { ...job, timings: markTiming(job.timings, "generation_started_at"), pipeline: startStage(job.pipeline, "generation", "Writing Markdown article."), updatedAt: nowIso() };
      await this.store.saveJob(job);
      const generation = normaliseGenerationResult(await this.model.generateArticle({ title: job.title, research, controls: settings.controls, plan, profileSnapshot, knowledgeBase }));
      await this.throwIfEmergencyStopped(job.projectId);
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
      const validation = heuristicValidation({ title: job.title, markdown, research, controls: settings.controls, targetWords: plan.targetWords, profileSnapshot });
      const planningDiagnostics = buildPlanningDiagnostics(plan, markdown, research);
      needsReview.push(...validation.needsReviewReasons);
      const uniqueReasons = [...new Set(needsReview)];
      const finalStatus = statusFromReviewReasons(uniqueReasons);
      job = { ...job, timings: markTiming(job.timings, "save_completed_at") };
      let pipeline = completeStage(job.pipeline, "save", { markdownSaved: true });
      pipeline = skipStage(pipeline, "editor", settings.controls.runEditor ? "Deferred to keep queue processing under Vercel timeout." : "AI editor disabled.");
      job = { ...job, timings: markTiming(job.timings, "validation_started_at") };
      pipeline = startStage(pipeline, "validation", "Running fast advisory validation.");
      job = { ...job, timings: markTiming(job.timings, "validation_completed_at") };
      pipeline = completeStage(pipeline, "validation", {
        warnings: validation.warnings.length,
        qualityScore: validation.qualityScore,
        mode: "heuristic",
        planningDiagnostics
      });
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

      const costTelemetry = buildArticleCostTelemetry(job, markdown, research, generation, plan, planningDiagnostics);
      const article = createArticle(job, markdown, uniqueReasons, validation, research, plan.targetWords, profileSnapshot, planningDiagnostics, costTelemetry);
      await this.store.saveArticle(article);
      await this.saveGenerationTelemetry(job, article, research, generation, plan, log);
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
    const last = await this.store.getLatestQueuePosition(projectId);
    return Math.max(Date.now(), last + 1);
  }

  private async saveGenerationTelemetry(
    job: QueueJob,
    article: ArticleDocument,
    research: Parameters<typeof heuristicValidation>[0]["research"],
    generation: ModelGenerationResult,
    plan: ReturnType<typeof buildArticleGenerationPlan>,
    log: (event: Omit<DebugEvent, "at">) => void
  ) {
    const now = nowIso();
    const planningDiagnostics = article.planningDiagnostics ?? buildPlanningDiagnostics(plan, article.markdown, research);
    const costTelemetry = article.costTelemetry ?? buildArticleCostTelemetry(job, article.markdown, research, generation, plan, planningDiagnostics);
    const aiCost = costTelemetry.estimatedGenerationCostUsd;
    const researchCost = costTelemetry.estimatedResearchCostUsd;
    const inputTokens = generation.inputTokens ?? 0;
    const outputTokens = generation.outputTokens ?? 0;
    const findingsExtracted = research.usefulFacts.length + research.rejectedFacts.length + research.questionsFound.length + research.headingsFound.length;
    const telemetryQuality = calculateTelemetryQuality({
      targetAchievementPercent: planningDiagnostics.targetAchievementPercent,
      plannedH2Count: planningDiagnostics.plannedH2Count,
      actualH2Count: planningDiagnostics.actualH2Count,
      plannedH3Count: planningDiagnostics.plannedH3Count,
      actualH3Count: planningDiagnostics.actualH3Count,
      actualBreadthCoveragePercent: planningDiagnostics.actualBreadthCoveragePercent,
      plannerOutcome: planningDiagnostics.plannerOutcome,
      breadthStatus: planningDiagnostics.breadthStatus,
      researchConceptCount: planningDiagnostics.researchConceptCount,
      sourcesAccepted: research.sources.length
    });
    const telemetry: GenerationTelemetryDocument = {
      projectId: job.projectId,
      articleId: job.articleId,
      jobId: job.id,
      createdByUserId: job.createdByUserId ?? article.createdByUserId ?? null,
      generationProvider: costTelemetry.generationProvider,
      model: costTelemetry.generationModel,
      generationModel: costTelemetry.generationModel,
      targetWords: plan.targetWords,
      actualWords: article.wordCount,
      plannedSections: plan.h2SectionCount,
      actualSections: planningDiagnostics.actualH2Count,
      plannedH2Count: planningDiagnostics.plannedH2Count,
      plannedH3Count: planningDiagnostics.plannedH3Count,
      expectedDepth: planningDiagnostics.expectedDepth,
      actualH2Count: planningDiagnostics.actualH2Count,
      actualH3Count: planningDiagnostics.actualH3Count,
      actualDepth: planningDiagnostics.actualDepth,
      h2AchievementPercent: planningDiagnostics.h2AchievementPercent,
      h3AchievementPercent: planningDiagnostics.h3AchievementPercent,
      targetAchievementPercent: planningDiagnostics.targetAchievementPercent,
      plannerOutcome: planningDiagnostics.plannerOutcome,
      researchConceptCount: planningDiagnostics.researchConceptCount,
      researchConcepts: planningDiagnostics.researchConcepts,
      plannedBreadthRatio: planningDiagnostics.plannedBreadthRatio,
      actualBreadthCoverage: planningDiagnostics.actualBreadthCoverage,
      actualBreadthCoveragePercent: planningDiagnostics.actualBreadthCoveragePercent,
      breadthStatus: planningDiagnostics.breadthStatus,
      qualityScore: telemetryQuality.qualityScore,
      qualityBand: telemetryQuality.qualityBand,
      finishReason: generation.finishReason ?? null,
      reviewStatus: article.status,
      profileVersion: article.profileSnapshot?.profileVersion ?? 0,
      region: article.profileSnapshot?.region ?? null,
      industry: article.profileSnapshot?.industry ?? null,
      audience: article.profileSnapshot?.audience ?? null,
      profileKey: article.profileSnapshot?.profileKey ?? null,
      profileRelevanceScore: article.profileRelevanceScore ?? null,
      regionAwarenessActive: article.profileSnapshot?.regionAwarenessActive ?? false,
      industryAwarenessActive: article.profileSnapshot?.industryAwarenessActive ?? false,
      audienceAwarenessActive: article.profileSnapshot?.audienceAwarenessActive ?? false,
      researchDurationMs: durationMs(job.timings?.research_started_at, job.timings?.research_completed_at),
      sourcesDiscovered: research.sources.length + research.rejectedSources.length,
      sourcesAccepted: research.sources.length,
      sourcesRejected: research.rejectedSources.length,
      findingsExtracted,
      usefulFactsExtracted: research.usefulFacts.length,
      citationsGenerated: research.usefulFactSources?.length ?? 0,
      inputTokens,
      outputTokens,
      totalTokens: costTelemetry.totalTokens,
      researchTokens: estimateResearchTokens(research),
      generationTokens: costTelemetry.totalTokens,
      estimatedAiCostUsd: aiCost,
      estimatedGenerationCostUsd: aiCost,
      generationCostPricingSource: costTelemetry.generationCostPricingSource,
      exaSearchCalls: costTelemetry.exaSearchRequests,
      exaContentCalls: costTelemetry.exaContentPages,
      exaSearchRequests: costTelemetry.exaSearchRequests,
      exaContentPages: costTelemetry.exaContentPages,
      estimatedExaSearchCostUsd: costTelemetry.estimatedExaSearchCostUsd,
      estimatedExaContentCostUsd: costTelemetry.estimatedExaContentCostUsd,
      estimatedResearchCostUsd: researchCost,
      totalCostUsd: costTelemetry.estimatedTotalCostUsd,
      totalDurationMs: costTelemetry.totalDurationMs,
      costPerWord: costTelemetry.costPerWord,
      costPerResearchConcept: costTelemetry.costPerResearchConcept,
      costPerSource: costTelemetry.costPerSource,
      generationDurationMs: costTelemetry.generationDurationMs,
      metadata: {
        status: job.status,
        finishReason: generation.finishReason ?? null,
        researchRunId: research.id ?? null,
        researchRequestIds: research.requestIds,
        sourceCount: research.sources.length,
        targetWords: plan.targetWords,
        actualWords: article.wordCount,
        plannedSections: plan.h2SectionCount,
        actualSections: planningDiagnostics.actualH2Count,
        planningDiagnostics,
        findingsExtracted,
        profileSnapshot: article.profileSnapshot ?? null,
        profileRelevanceScore: article.profileRelevanceScore ?? null,
        costTelemetry
      },
      createdAt: now,
      updatedAt: now
    };

    try {
      await this.store.saveGenerationTelemetry(telemetry);
      log({ stage: "generation", level: "info", message: "Generation telemetry recorded.", data: { totalCostUsd: telemetry.totalCostUsd } });
      await exportArticleTelemetry(this.store, telemetry);
      log({ stage: "export", level: "info", message: "Article telemetry export attempted.", data: { articleId: telemetry.articleId } });
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
    const counts = await this.store.getCompactJobCounts(projectId);
    if (counts.queued > 0 || counts.processing > 0) return;
    const now = nowIso();
    await this.store.saveQueueControl({
      ...control,
      mode: "stopped",
      stoppedAt: now,
      reason: "Queue completed.",
      updatedAt: now
    });
  }

  private async throwIfEmergencyStopped(projectId: string) {
    const control = await this.store.getQueueControl(projectId);
    if (control.mode === "stopped" && control.reason === EMERGENCY_STOP_REASON) {
      throw new Error(EMERGENCY_STOP_REASON);
    }
  }
}

function reconciledJob(job: QueueJob, article: ArticleDocument): QueueJob {
  const reconciledAt = nowIso();
  return {
    ...job,
    status: article.status,
    needsReviewReasons: article.needsReviewReasons,
    pipeline: article.pipeline,
    timings: { ...article.timings, state_reconciled_at: article.timings?.state_reconciled_at ?? reconciledAt },
    updatedAt: reconciledAt,
    fatalError: undefined
  };
}

function estimateResearchTokens(research: Parameters<typeof heuristicValidation>[0]["research"]) {
  const text = [
    ...research.queries,
    ...research.usefulFacts,
    ...research.rejectedFacts,
    ...research.questionsFound,
    ...research.headingsFound,
    ...research.sources.flatMap((source) => [source.title, source.summary ?? "", ...source.highlights]),
    ...research.rejectedSources.flatMap((source) => [source.title, source.summary ?? "", ...source.highlights])
  ].join(" ");
  return Math.ceil(text.length / 4);
}

function normaliseGenerationResult(result: string | ModelGenerationResult): ModelGenerationResult {
  if (typeof result === "string") {
    const model = process.env.AI_GENERATION_MODEL ?? "deepseek-v4-flash";
    return {
      markdown: result,
      provider: pricingForModel(model).provider,
      model,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      finishReason: null,
      estimatedAiCostUsd: 0
    };
  }
  const model = result.model ?? process.env.AI_GENERATION_MODEL ?? "deepseek-v4-flash";
  return {
    ...result,
    provider: result.provider ?? pricingForModel(model).provider,
    model,
    inputTokens: result.inputTokens ?? 0,
    outputTokens: result.outputTokens ?? 0,
    totalTokens: result.totalTokens ?? (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
    finishReason: result.finishReason ?? null,
    estimatedAiCostUsd: result.estimatedAiCostUsd ?? 0
  };
}

function buildArticleCostTelemetry(
  job: QueueJob,
  markdown: string,
  research: Parameters<typeof heuristicValidation>[0]["research"],
  generation: ModelGenerationResult,
  _plan: ReturnType<typeof buildArticleGenerationPlan>,
  planningDiagnostics: NonNullable<ArticleDocument["planningDiagnostics"]>
): NonNullable<ArticleDocument["costTelemetry"]> {
  const generationModel = generation.model ?? process.env.AI_GENERATION_MODEL ?? "deepseek-v4-flash";
  const generationProvider = generation.provider ?? pricingForModel(generationModel).provider;
  const inputTokens = generation.inputTokens ?? 0;
  const outputTokens = generation.outputTokens ?? 0;
  const totalTokens = generation.totalTokens ?? inputTokens + outputTokens;
  const exaSearchRequests = research.exaSearchRequests ?? research.exaSearchCalls ?? research.queries.length;
  const exaContentPages = research.exaContentPages ?? research.exaContentCalls ?? research.requestIds.length;
  const estimatedExaSearchCost = research.estimatedExaSearchCostUsd ?? estimatedExaSearchCostUsd(exaSearchRequests);
  const estimatedExaContentCost = research.estimatedExaContentCostUsd ?? estimatedExaContentCostUsd(exaContentPages);
  const estimatedResearchCost = research.estimatedResearchCostUsd ?? estimateResearchCostUsd(exaSearchRequests, exaContentPages);
  const calculatedGenerationCost = estimateGenerationCost(inputTokens, outputTokens, generationModel, generationProvider);
  const suppliedGenerationCost = generation.estimatedAiCostUsd ?? 0;
  const useCalculatedGenerationCost = suppliedGenerationCost <= 0 && inputTokens + outputTokens > 0 && calculatedGenerationCost.costUsd > 0;
  const estimatedGenerationCost = useCalculatedGenerationCost ? calculatedGenerationCost.costUsd : suppliedGenerationCost;
  const generationCostPricingSource = generation.generationCostPricingSource
    ?? (useCalculatedGenerationCost ? calculatedGenerationCost.pricingSource : null);
  const estimatedTotalCost = roundUsd(estimatedResearchCost + estimatedGenerationCost);
  const wordCount = countWords(markdown);
  const researchConceptCount = planningDiagnostics.researchConceptCount ?? research.researchConceptCount ?? research.researchConcepts?.length ?? 0;
  const sourceCount = research.sources.length + research.rejectedSources.length;
  const researchDurationMs = durationMs(job.timings?.research_started_at, job.timings?.research_completed_at);
  const generationDurationMs = durationMs(job.timings?.generation_started_at, job.timings?.generation_completed_at);
  const totalDurationMs = durationMs(job.timings?.processing_at ?? job.timings?.started_at, job.timings?.completed_at ?? nowIso());

  return {
    generationProvider,
    generationModel,
    inputTokens,
    outputTokens,
    totalTokens,
    exaSearchRequests,
    exaContentPages,
    estimatedExaSearchCostUsd: estimatedExaSearchCost,
    estimatedExaContentCostUsd: estimatedExaContentCost,
    estimatedResearchCostUsd: estimatedResearchCost,
    estimatedGenerationCostUsd: estimatedGenerationCost,
    generationCostPricingSource,
    estimatedTotalCostUsd: estimatedTotalCost,
    costPerWord: wordCount ? roundUsd(estimatedTotalCost / wordCount) : 0,
    costPerResearchConcept: researchConceptCount ? roundUsd(estimatedTotalCost / researchConceptCount) : 0,
    costPerSource: sourceCount ? roundUsd(estimatedTotalCost / sourceCount) : 0,
    researchDurationMs,
    generationDurationMs,
    totalDurationMs
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
  if (source === "worker" && owner === "manual" && isBetweenCompletedStages(job)) return true;
  return owner === source;
}

function isResumableQueuedJob(job: QueueJob) {
  return job.status === "queued" && (
    job.attempts > 0 ||
    job.pipeline.some((step) => step.status === "done" || step.status === "running")
  );
}

function isBetweenCompletedStages(job: QueueJob) {
  return job.pipeline.some((step) => step.status === "done")
    && !job.pipeline.some((step) => step.status === "running");
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function createArticle(
  job: QueueJob,
  markdown: string,
  needsReviewReasons: string[],
  validation: ArticleDocument["validation"],
  research: Parameters<typeof heuristicValidation>[0]["research"],
  targetWords?: number,
  profileSnapshot?: ArticleDocument["profileSnapshot"],
  planningDiagnostics?: ArticleDocument["planningDiagnostics"],
  costTelemetry?: ArticleDocument["costTelemetry"]
): ArticleDocument {
  const now = nowIso();
  const sources = research.sources;
  return {
    id: job.articleId,
    projectId: job.projectId,
    jobId: job.id,
    title: job.title,
    status: job.status === "processing" ? statusFromReviewReasons(needsReviewReasons) : job.status,
    isPinned: false,
    markdown,
    createdAt: job.createdAt,
    updatedAt: now,
    wordCount: countWords(markdown),
    targetWords,
    profileSnapshot,
    profileRelevanceScore: validation.profileRelevanceScore ?? null,
    planningDiagnostics: planningDiagnostics ?? null,
    costTelemetry: costTelemetry ?? null,
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

function failCurrentOrNextStage(pipeline: QueueJob["pipeline"], message: string) {
  const running = pipeline.find((step) => step.status === "running");
  if (running) return failStage(pipeline, running.stage, message);
  const next = pipeline.find((step) => step.status === "idle");
  return next ? failStage(pipeline, next.stage, message) : pipeline;
}
