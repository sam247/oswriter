import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueueRunner } from "@/lib/queue/runner";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { WorkspaceStore } from "@/lib/storage/storage";
import type { ArticleGenerationInput, EditorInput, ModelAdapter, SearchAdapter, ValidationInput, ValidationResult } from "@/lib/types";

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

function setup(search: SearchAdapter = new FakeSearch(), model: ModelAdapter = new FakeModel(), store = new WorkspaceStore(new MemoryStorageAdapter())) {
  const runner = new QueueRunner(store, search, model);
  return { store, runner };
}

async function drainQueue(runner: QueueRunner, maxSteps = 1000) {
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
