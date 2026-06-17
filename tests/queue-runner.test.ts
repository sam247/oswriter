import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueueRunner } from "@/lib/queue/runner";
import { getQueueMutationBlocker } from "@/lib/queue/safety";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { WorkspaceStore } from "@/lib/storage/storage";
import type { ArticleGenerationInput, EditorInput, ModelAdapter, ModelGenerationResult, SearchAdapter, ValidationInput, ValidationResult } from "@/lib/types";
import { isGlobalSearchShortcut } from "@/lib/ui/keyboard";

class FakeSearch implements SearchAdapter {
  constructor(private readonly mode: "strong" | "weak" | "down" = "strong") {}

  async search(query: string) {
    if (this.mode === "down") throw new Error("Exa search unavailable");
    const count = this.mode === "weak" ? 1 : 5;
    return {
      requestId: `req_${query}`,
      results: Array.from({ length: count }, (_, index) => ({
        title: index === 0 ? "GOV.UK technical guidance" : `Water authority source ${index}`,
        url: index === 0 ? `https://www.gov.uk/guidance/${encodeURIComponent(query)}` : `https://water.org.uk/source-${index}-${encodeURIComponent(query)}`,
        summary: "This source provides technical guidance, requirements, standards, legislation, and practical facts for UK infrastructure work.",
        highlights: ["Developers should follow current guidance and confirm local requirements before work starts."]
      }))
    };
  }
}

class CountingSearch extends FakeSearch {
  calls = 0;

  async search(query: string) {
    this.calls += 1;
    return super.search(query);
  }
}

class FakeModel implements ModelAdapter {
  constructor(private readonly validationWarnings: string[] = []) {}

  async generateArticle(input: ArticleGenerationInput) {
    return `# ${input.title}

Intro paragraph with a direct practical answer for the reader.

## Requirements
Useful details based on the research notes.

## Process
Practical sequence and decision points.

## Costs And Timing
Plain-English explanation without fake precision.

## Common Problems
Risks and checks to consider.

## Practical Next Steps
What to do next.

## FAQ

### What should you check first?
Check the current project requirements first.`;
  }

  async editArticle(input: EditorInput) {
    return input.markdown.replace("Intro paragraph", "Clear intro paragraph");
  }

  async validateArticle(input: ValidationInput): Promise<ValidationResult> {
    return {
      pass: this.validationWarnings.length === 0,
      warnings: this.validationWarnings,
      needsReviewReasons: this.validationWarnings,
      qualityScore: this.validationWarnings.length ? 62 : 92,
      sectionScores: { research: input.research.confidence, intent: 90, headings: 90, readability: 88 },
      faqScore: this.validationWarnings.length ? 55 : 88,
      seoScore: 84
    };
  }
}

class DownModel extends FakeModel {
  async generateArticle(): Promise<string> {
    throw new Error("OpenAI API unavailable");
  }
}

class SparseModel extends FakeModel {
  async generateArticle(input: ArticleGenerationInput) {
    return `# ${input.title}

Short answer with a draft that intentionally has thin structure.`;
  }
}

class MeteredModel implements ModelAdapter {
  async generateArticle(input: ArticleGenerationInput): Promise<ModelGenerationResult> {
    const markdown = await new FakeModel().generateArticle(input);
    return {
      markdown,
      model: "metered-model",
      inputTokens: 1200,
      outputTokens: 800,
      finishReason: "stop",
      estimatedAiCostUsd: 0.004
    };
  }

  async editArticle(input: EditorInput) {
    return input.markdown;
  }

  async validateArticle(input: ValidationInput): Promise<ValidationResult> {
    return new FakeModel().validateArticle(input);
  }
}

function setup(search: SearchAdapter = new FakeSearch(), model: ModelAdapter = new FakeModel(), store = new WorkspaceStore(new MemoryStorageAdapter())) {
  const runner = new QueueRunner(store, search, model);
  return { store, runner };
}

async function drainQueue(runner: QueueRunner, maxSteps = 1000, resume = true) {
  if (resume) await runner.resumeQueue();
  for (let i = 0; i < maxSteps; i += 1) {
    const result = await runner.processNext();
    if (!result.processed) return;
  }
  throw new Error(`Queue did not drain within ${maxSteps} steps.`);
}

describe("QueueRunner", () => {
  it("processes queued titles in the order they were submitted", async () => {
    const { store, runner } = setup();
    await runner.addTitles(["First queued article", "Second queued article", "Third queued article"]);
    await runner.resumeQueue();

    const initial = await store.getState();
    assert.deepEqual(initial.jobs.map((job) => job.title), ["First queued article", "Second queued article", "Third queued article"]);
    assert.ok(initial.jobs[0].createdAt < initial.jobs[1].createdAt);
    assert.ok(initial.jobs[1].createdAt < initial.jobs[2].createdAt);

    const processedTitles: string[] = [];
    for (let index = 0; index < 9; index += 1) {
      const result = await runner.processNext();
      assert.ok(result.job);
      processedTitles.push(result.job.title);
    }

    assert.deepEqual(processedTitles, [
      "First queued article",
      "First queued article",
      "First queued article",
      "Second queued article",
      "Second queued article",
      "Second queued article",
      "Third queued article",
      "Third queued article",
      "Third queued article"
    ]);
  });

  it("keeps newly queued work stopped until generation is explicitly started", async () => {
    const { store, runner } = setup();
    await runner.addTitles(["Wait for the generate button"]);

    const workerAttempt = await runner.processNext(undefined, { source: "worker" });
    assert.equal(workerAttempt.processed, false);
    assert.equal((await store.getState()).jobs[0].status, "queued");

    await runner.resumeQueue();
    const manualAttempt = await runner.processNext(undefined, { source: "manual" });
    assert.equal(manualAttempt.processed, true);
    assert.equal(manualAttempt.job?.status, "processing");
  });

  it("stops an idle previously-running queue when titles are added", async () => {
    const { store, runner } = setup();
    await runner.resumeQueue();

    await runner.addTitles(["Previously hot queue should not autostart"]);

    assert.equal((await store.getQueueControl()).mode, "stopped");
    const workerAttempt = await runner.processNext(undefined, { source: "worker" });
    assert.equal(workerAttempt.processed, false);
    assert.equal((await store.getState()).jobs[0].status, "queued");
  });

  it("does not let the worker duplicate research for an active manual job", async () => {
    const search = new CountingSearch();
    const { store, runner } = setup(search);
    const [job] = await runner.addTitles(["Manual job in progress"]);
    const startedAt = new Date().toISOString();
    await store.saveJob({
      ...job,
      status: "processing",
      updatedAt: startedAt,
      timings: {
        ...job.timings,
        started_at: startedAt,
        processing_at: startedAt,
        started_by: "manual"
      }
    });

    const workerResult = await runner.processNext(undefined, { source: "worker" });
    assert.equal(workerResult.processed, false);
    assert.equal(workerResult.job?.id, job.id);
    assert.equal(search.calls, 0);

    const manualResult = await runner.processNext(undefined, { source: "manual" });
    assert.equal(manualResult.processed, true);
    assert.equal(manualResult.job?.id, job.id);
    assert.ok(search.calls > 0);
  });

  it("stops gracefully after the current article completes", async () => {
    const { store, runner } = setup();
    const [first, second] = await runner.addTitles(["Finish me first", "Do not start yet"]);
    await runner.resumeQueue();

    const started = await runner.processNext(undefined, { source: "manual" });
    assert.equal(started.job?.id, first.id);
    assert.equal(started.job?.status, "processing");

    const control = await runner.stopAfterCurrent();
    assert.equal(control.mode, "stop_after_current");

    await drainQueue(runner, 1000, false);
    const state = await store.getState();
    assert.equal(state.queueControl.mode, "stopped");
    assert.ok(["generated", "needs_review"].includes(state.jobs.find((job) => job.id === first.id)?.status ?? ""));
    assert.equal(state.jobs.find((job) => job.id === second.id)?.status, "queued");
    assert.equal(state.articles.length, 1);
  });

  it("continues a recovered current article while stop-after-current is active", async () => {
    const { store, runner } = setup();
    const [first, second] = await runner.addTitles(["Recovered current", "Do not start after recovery"]);
    await runner.resumeQueue();

    const researched = await runner.processNext(undefined, { source: "manual" });
    assert.equal(researched.job?.id, first.id);
    assert.equal(researched.job?.pipeline.find((step) => step.stage === "research")?.status, "done");

    await runner.stopAfterCurrent();
    await store.saveJob({
      ...researched.job!,
      status: "queued",
      updatedAt: new Date(Date.now() - 60 * 60_000).toISOString()
    });

    await drainQueue(runner, 1000, false);
    const state = await store.getState();
    assert.equal(state.queueControl.mode, "stopped");
    assert.ok(["generated", "needs_review"].includes(state.jobs.find((job) => job.id === first.id)?.status ?? ""));
    assert.equal(state.jobs.find((job) => job.id === second.id)?.status, "queued");
    assert.equal(state.articles.length, 1);
  });

  it("emergency stop fails the current resumable job and stops the queue", async () => {
    const { store, runner } = setup();
    const [first, second] = await runner.addTitles(["Emergency current", "Still queued"]);
    await runner.resumeQueue();
    const researched = await runner.processNext(undefined, { source: "manual" });
    await store.saveJob({ ...researched.job!, status: "queued" });

    const stopped = await runner.emergencyStop();
    const state = await store.getState();

    assert.equal(stopped?.id, first.id);
    assert.equal(state.queueControl.mode, "stopped");
    assert.match(state.queueControl.reason ?? "", /Emergency stopped/i);
    assert.equal(state.jobs.find((job) => job.id === first.id)?.status, "failed");
    assert.equal(state.jobs.find((job) => job.id === second.id)?.status, "queued");
  });

  it("protects queue ownership while a job is processing", async () => {
    const { store, runner } = setup();
    await runner.addTitles(["Owned processing job"]);
    await runner.resumeQueue();
    await runner.processNext(undefined, { source: "manual" });

    const blocker = await getQueueMutationBlocker(store);
    assert.match(blocker ?? "", /processing/i);
  });

  it("reorders queued jobs safely", async () => {
    const { store, runner } = setup();
    const [first, second, third] = await runner.addTitles(["First", "Second", "Third"]);

    await runner.moveJob(third.id, "top");
    assert.deepEqual((await store.listJobs()).map((job) => job.title), ["Third", "First", "Second"]);

    await runner.moveJob(first.id, "bottom");
    assert.deepEqual((await store.listJobs()).map((job) => job.title), ["Third", "Second", "First"]);

    await runner.moveJob(second.id, "up");
    assert.deepEqual((await store.listJobs()).map((job) => job.title), ["Second", "Third", "First"]);
  });

  it("skips a queued job while retaining history", async () => {
    const { store, runner } = setup();
    const [job] = await runner.addTitles(["Skip this item"]);

    const skipped = await runner.skipJob(job.id);
    assert.equal(skipped.status, "skipped");
    assert.equal(skipped.statusReason, "Skipped by user.");
    assert.equal((await store.listJobs()).length, 1);
  });

  it("records generation telemetry after an article is saved", async () => {
    const previousSearchCost = process.env.EXA_SEARCH_COST_USD;
    const previousContentCost = process.env.EXA_CONTENT_COST_USD;
    process.env.EXA_SEARCH_COST_USD = "0.001";
    process.env.EXA_CONTENT_COST_USD = "0.002";
    try {
      const { store, runner } = setup(new FakeSearch(), new MeteredModel());
      const [job] = await runner.addTitles(["Telemetry cost tracking"]);

      await drainQueue(runner);

      const telemetry = await store.getGenerationTelemetry(job.articleId);
      assert.ok(telemetry);
      assert.equal(telemetry.projectId, job.projectId);
      assert.equal(telemetry.articleId, job.articleId);
      assert.equal(telemetry.jobId, job.id);
      assert.equal(telemetry.model, "metered-model");
      assert.equal(telemetry.inputTokens, 1200);
      assert.equal(telemetry.outputTokens, 800);
      assert.equal(telemetry.generationTokens, 2000);
      assert.ok(telemetry.targetWords > 0);
      assert.equal(telemetry.profileVersion, 1);
      assert.equal(telemetry.region, "global");
      assert.equal(telemetry.industry, "general");
      assert.equal(telemetry.audience, "general_audience");
      assert.equal(telemetry.regionAwarenessActive, false);
      assert.ok(typeof telemetry.profileRelevanceScore === "number");
      assert.ok(telemetry.actualWords > 0);
      assert.ok(telemetry.plannedSections > 0);
      assert.ok(telemetry.actualSections > 0);
      assert.equal(telemetry.finishReason, "stop");
      assert.ok(["generated", "needs_review"].includes(telemetry.reviewStatus));
      assert.equal(telemetry.sourcesDiscovered, telemetry.sourcesAccepted + telemetry.sourcesRejected);
      assert.ok(telemetry.sourcesDiscovered > 0);
      assert.ok(telemetry.sourcesRejected >= 0);
      assert.ok(telemetry.findingsExtracted > 0);
      assert.ok(telemetry.researchTokens > 0);
      assert.equal(telemetry.estimatedAiCostUsd, 0.004);
      assert.equal(telemetry.exaSearchCalls, 5);
      assert.equal(telemetry.exaContentCalls, 5);
      assert.equal(telemetry.estimatedResearchCostUsd, 0.015);
      assert.equal(telemetry.totalCostUsd, 0.019);
      assert.equal(telemetry.metadata.finishReason, "stop");
      assert.ok((telemetry.generationDurationMs ?? -1) >= 0);
    } finally {
      restoreEnv("EXA_SEARCH_COST_USD", previousSearchCost);
      restoreEnv("EXA_CONTENT_COST_USD", previousContentCost);
    }
  });

  it("regenerates later by moving an item to the queue end with settings preserved", async () => {
    const { store, runner } = setup();
    const [first, second] = await runner.addTitles(["Regenerate later", "Stay ahead"]);
    await runner.skipJob(first.id);

    const regenerated = await runner.regenerateLater(first.id);
    const jobs = await store.listJobs();
    assert.equal(regenerated.status, "queued");
    assert.equal(regenerated.title, first.title);
    assert.equal(regenerated.pipeline.length, first.pipeline.length);
    assert.deepEqual(jobs.map((job) => job.id), [second.id, first.id]);
  });

  it("searches and groups projects, articles, research sources, runs, and findings", async () => {
    const { store, runner } = setup();
    await runner.addTitles(["Shopify Collection SEO Guide"]);
    await drainQueue(runner);

    const articleResults = await store.globalSearch("Collection SEO");
    assert.equal(articleResults.groups.article[0]?.title, "Shopify Collection SEO Guide");
    assert.ok(articleResults.groups.research_run.some((result) => result.title === "Shopify Collection SEO Guide"));

    const sourceResults = await store.globalSearch("gov.uk");
    assert.ok(sourceResults.groups.research_source.some((result) => /gov\.uk/i.test(result.title + result.subtitle)));

    const findingResults = await store.globalSearch("technical guidance");
    assert.ok(findingResults.groups.research_finding.some((result) => /technical guidance/i.test(result.title)));

    const projectResults = await store.globalSearch("Default Project");
    assert.equal(projectResults.groups.project[0]?.title, "Default Project");
  });

  it("detects global search keyboard shortcuts", () => {
    assert.equal(isGlobalSearchShortcut({ key: "k", metaKey: true, ctrlKey: false }), true);
    assert.equal(isGlobalSearchShortcut({ key: "K", metaKey: false, ctrlKey: true }), true);
    assert.equal(isGlobalSearchShortcut({ key: "k", metaKey: false, ctrlKey: false }), false);
  });

  it("persists workspace account, notification, provider, and operational preferences", async () => {
    const { store } = setup();
    const preferences = await store.getWorkspacePreferences();
    await store.saveWorkspacePreferences({
      ...preferences,
      account: {
        name: "Sam",
        email: "sam@example.com",
        workspaceName: "OS Writer"
      },
      notifications: {
        ...preferences.notifications,
        queueCompleted: false,
        dailySummaryEmail: true
      },
      aiProvider: {
        preference: "bring_your_own_key",
        personalKeyStatus: "placeholder"
      },
      operational: {
        ...preferences.operational,
        autoStartQueueOnAdd: true,
        confirmBeforeDeletingArticles: false,
        confirmBeforeDeletingProjects: true,
        defaultTargetWordCount: 1800,
        reuseProjectResearch: false,
        reuseTitleResearch: false
      },
      updatedAt: new Date().toISOString()
    });

    const state = await store.getState();
    assert.equal(state.preferences.account.email, "sam@example.com");
    assert.equal(state.preferences.notifications.dailySummaryEmail, true);
    assert.equal(state.preferences.aiProvider.preference, "bring_your_own_key");
    assert.equal(state.preferences.operational.autoStartQueueOnAdd, true);
    assert.equal(state.preferences.operational.defaultTargetWordCount, 1800);
  });

  it("isolates jobs and articles by active project", async () => {
    const { store, runner } = setup();
    await runner.addTitles(["Default project article"]);
    await drainQueue(runner);
    const defaultState = await store.getState("default");
    assert.equal(defaultState.jobs.length, 1);
    assert.equal(defaultState.articles.length, 1);

    await store.saveProject({
      id: "project_second",
      name: "Second Project",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await store.setActiveProjectId("project_second");
    await runner.addTitles(["Second project article"]);
    await drainQueue(runner);

    const activeState = await store.getState();
    assert.equal(activeState.project.id, "project_second");
    assert.deepEqual(activeState.jobs.map((job) => job.title), ["Second project article"]);
    assert.equal(activeState.articles.length, 1);

    const preservedDefaultState = await store.getState("default");
    assert.deepEqual(preservedDefaultState.jobs.map((job) => job.title), ["Default project article"]);
    assert.equal(preservedDefaultState.articles.length, 1);
  });

  it("lists and switches projects without mixing article libraries", async () => {
    const { store, runner } = setup();
    await runner.addTitles(["Default library article"]);
    await drainQueue(runner);

    const now = new Date().toISOString();
    await store.saveProject({ id: "project_library", name: "Library Project", createdAt: now, updatedAt: now });
    await store.setActiveProjectId("project_library");
    await runner.addTitles(["Isolated library article"]);
    await drainQueue(runner);

    const projects = await store.listProjects();
    assert.ok(projects.some((project) => project.id === "default"));
    assert.ok(projects.some((project) => project.id === "project_library"));

    const active = await store.getState();
    assert.equal(active.project.id, "project_library");
    assert.deepEqual(active.articles.map((article) => article.title), ["Isolated library article"]);

    await store.setActiveProjectId("default");
    const restored = await store.getState();
    assert.deepEqual(restored.articles.map((article) => article.title), ["Default library article"]);
  });

  it("deletes a specific inactive project without clearing the active project", async () => {
    const { store, runner } = setup();
    await runner.addTitles(["Default survives"]);
    await drainQueue(runner);

    const now = new Date().toISOString();
    await store.saveProject({ id: "project_delete_me", name: "Delete Me", createdAt: now, updatedAt: now });
    await store.setActiveProjectId("project_delete_me");
    await runner.addTitles(["Temporary article"]);
    await drainQueue(runner);
    await store.setActiveProjectId("default");

    await store.deleteProject("project_delete_me");
    const projects = await store.listProjects();
    const state = await store.getState();

    assert.equal(state.project.id, "default");
    assert.deepEqual(state.articles.map((article) => article.title), ["Default survives"]);
    assert.equal(projects.some((project) => project.id === "project_delete_me"), false);
    assert.equal((await store.listArticles("project_delete_me")).length, 0);
  });

  it("deleting the active project returns the workspace to default", async () => {
    const { store, runner } = setup();
    const now = new Date().toISOString();
    await store.saveProject({ id: "project_active_delete", name: "Active Delete", createdAt: now, updatedAt: now });
    await store.setActiveProjectId("project_active_delete");
    await runner.addTitles(["Active temporary article"]);
    await drainQueue(runner);

    await store.deleteProject("project_active_delete");
    const state = await store.getState();

    assert.equal(state.project.id, "default");
    assert.equal(state.projects?.some((project) => project.id === "project_active_delete"), false);
  });

  it("clears queue work without deleting completed article assets", async () => {
    const { store, runner } = setup();
    await runner.addTitles(["Completed article", "Failed queue item"]);
    const [first, second] = await store.listJobs();
    await drainQueue(runner);
    await store.saveJob({
      ...second,
      status: "failed",
      fatalError: "Provider error",
      updatedAt: new Date().toISOString()
    });

    const before = await store.getState();
    assert.equal(before.articles.length, 2);
    assert.ok(before.jobs.some((job) => job.id === second.id && job.status === "failed"));

    const cleared = await store.clearQueueData();
    const after = await store.getState();
    assert.equal(cleared, 1);
    assert.equal(after.articles.length, 2);
    assert.ok(after.jobs.every((job) => job.status === "generated" || job.status === "needs_review"));
    assert.ok(after.articles.some((article) => article.jobId === first.id));
  });

  it("deletes an article asset without deleting its queue job", async () => {
    const { store, runner } = setup();
    await runner.addTitles(["Delete only article"]);
    await drainQueue(runner);

    const before = await store.getState();
    assert.equal(before.jobs.length, 1);
    assert.equal(before.articles.length, 1);

    await store.deleteArticle(before.articles[0].id);
    const after = await store.getState();
    assert.equal(after.jobs.length, 1);
    assert.equal(after.articles.length, 0);
  });

  it("processes 20 titles into 20 saved articles", async () => {
    const { store, runner } = setup();
    await runner.addTitles(Array.from({ length: 20 }, (_, index) => `Technical article ${index + 1}`));
    await drainQueue(runner);

    const state = await store.getState();
    assert.equal(state.jobs.length, 20);
    assert.equal(state.articles.length, 20);
    assert.equal(state.jobs.every((job) => job.status === "generated" || job.status === "needs_review"), true);
  });

  it("marks weak research as needs_review while still saving the article", async () => {
    const { store, runner } = setup(new FakeSearch("weak"), new FakeModel());
    await runner.addTitles(["Piling cost per metre UK"]);
    await drainQueue(runner);

    const state = await store.getState();
    assert.equal(state.jobs[0].status, "needs_review");
    assert.equal(state.articles.length, 1);
    assert.equal(state.articles[0].status, "needs_review");
    assert.match(state.articles[0].needsReviewReasons.join(" "), /source coverage|confidence|fewer/i);
  });

  it("marks advisory validation warnings as needs_review, never failed", async () => {
    const { store, runner } = setup(new FakeSearch(), new SparseModel());
    await runner.addTitles(["Road adoption process explained"]);
    await drainQueue(runner);

    const state = await store.getState();
    assert.equal(state.jobs[0].status, "needs_review");
    assert.equal(state.articles[0].status, "needs_review");
    assert.notEqual(state.jobs[0].status, "failed");
  });

  it("uses failed only for technical generation/search failure", async () => {
    const { store, runner } = setup(new FakeSearch(), new DownModel());
    await runner.addTitles(["What is a CBR test?"]);
    await drainQueue(runner);

    const state = await store.getState();
    assert.equal(state.jobs[0].status, "failed");
    assert.equal(state.articles.length, 0);
    assert.match(state.jobs[0].fatalError ?? "", /OpenAI API unavailable/);
  });

  it("recovers stale processing jobs back to queued", async () => {
    const { store, runner } = setup();
    const [job] = await runner.addTitles(["Stale test"]);
    await store.saveJob({
      ...job,
      status: "processing",
      updatedAt: new Date(Date.now() - 60 * 60_000).toISOString()
    });

    const count = await runner.reclaimStale();
    const state = await store.getState();
    assert.equal(count, 1);
    assert.equal(state.jobs[0].status, "queued");
  });

  it("recovers after browser refresh during processing", async () => {
    const { store, runner } = setup();
    await runner.addTitles(["Refresh during processing"]);
    await runner.resumeQueue();
    const firstStep = await runner.processNext();
    assert.equal(firstStep.job?.status, "processing");

    const resumed = setup(new FakeSearch(), new FakeModel(), store).runner;
    await drainQueue(resumed);

    const state = await store.getState();
    assert.notEqual(state.jobs[0].status, "failed");
    assert.equal(state.articles.length, 1);
  });

  it("recovers after app restart during processing", async () => {
    const { store, runner } = setup();
    await runner.addTitles(["Restart during processing"]);
    await runner.resumeQueue();
    await runner.processNext();
    await runner.processNext();

    const restarted = new QueueRunner(store, new FakeSearch(), new FakeModel());
    await drainQueue(restarted);

    const state = await store.getState();
    assert.notEqual(state.jobs[0].status, "failed");
    assert.equal(state.articles.length, 1);
  });

  it("recovers safely across 25 queued jobs", async () => {
    const { store, runner } = setup();
    await runner.addTitles(Array.from({ length: 25 }, (_, index) => `Recovery article ${index + 1}`));
    await runner.resumeQueue();
    await runner.processNext();
    await runner.processNext();

    const restarted = new QueueRunner(store, new FakeSearch(), new FakeModel());
    await drainQueue(restarted, 200);

    const state = await store.getState();
    assert.equal(state.jobs.length, 25);
    assert.equal(state.articles.length, 25);
    assert.equal(state.jobs.every((job) => job.status === "generated" || job.status === "needs_review"), true);
  });

  it("recovers safely across 50 queued jobs", async () => {
    const { store, runner } = setup();
    await runner.addTitles(Array.from({ length: 50 }, (_, index) => `Large queue article ${index + 1}`));
    await runner.resumeQueue();
    await runner.processNext();

    const restarted = setup(new FakeSearch(), new FakeModel(), store).runner;
    await drainQueue(restarted, 400);

    const state = await store.getState();
    assert.equal(state.jobs.length, 50);
    assert.equal(state.articles.length, 50);
    assert.equal(state.jobs.every((job) => job.status === "generated" || job.status === "needs_review"), true);
  });

  it("retries successfully after timeout-style research failure", async () => {
    const { store, runner } = setup(new FakeSearch("down"), new FakeModel());
    const [job] = await runner.addTitles(["Retry after timeout"]);
    await drainQueue(runner);
    assert.equal((await store.getState()).jobs[0].status, "failed");

    const healthy = setup(new FakeSearch(), new FakeModel(), store).runner;
    await healthy.retryJob(job.id);
    await drainQueue(healthy);

    const state = await store.getState();
    assert.notEqual(state.jobs[0].status, "failed");
    assert.equal(state.articles.length, 1);
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
