import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueueRunner } from "@/lib/queue/runner";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { WorkspaceStore } from "@/lib/storage/storage";
import { drainActiveProjectsWithLeases } from "@/lib/worker/drain";
import type { ArticleGenerationInput, EditorInput, ModelAdapter, SearchAdapter, ValidationInput, ValidationResult } from "@/lib/types";

class FakeSearch implements SearchAdapter {
  async search(query: string) {
    return {
      requestId: `request-${query}`,
      results: [{
        title: "Technical guidance",
        url: "https://example.com/guidance",
        summary: "Current technical requirements and practical guidance.",
        highlights: ["Confirm the current requirements before starting work."]
      }]
    };
  }
}

class FakeModel implements ModelAdapter {
  async generateArticle(input: ArticleGenerationInput) {
    return `# ${input.title}\n\n## Guidance\n\nUse the current technical guidance.`;
  }

  async editArticle(input: EditorInput) {
    return input.markdown;
  }

  async validateArticle(input: ValidationInput): Promise<ValidationResult> {
    return {
      pass: true,
      warnings: [],
      needsReviewReasons: [],
      qualityScore: 90,
      sectionScores: { research: input.research.confidence },
      faqScore: 90,
      seoScore: 90
    };
  }
}

function setup() {
  const store = new WorkspaceStore(new MemoryStorageAdapter());
  return { store, runner: new QueueRunner(store, new FakeSearch(), new FakeModel()) };
}

function forbidProjectWideReads(store: WorkspaceStore) {
  store.getState = async () => { throw new Error("worker must not call getState"); };
  store.getFullState = async () => { throw new Error("worker must not call getFullState"); };
  store.listArticles = async () => { throw new Error("worker must not call listArticles"); };
  store.listJobs = async () => { throw new Error("worker must not call listJobs"); };
}

describe("queue egress hardening", () => {
  it("uses only the compact project scan while the worker is idle", async () => {
    const { store, runner } = setup();
    await store.ensureProject();
    forbidProjectWideReads(store);
    store.getResearch = async () => { throw new Error("idle worker must not load research"); };

    const result = await drainActiveProjectsWithLeases({ store, runner });

    assert.equal(result.projectsWithWork, 0);
    assert.equal(result.processed, 0);
  });

  it("processes scheduled queue work without project-wide reads", async () => {
    const { store, runner } = setup();
    const [job] = await runner.addTitles(["Targeted scheduled generation"]);
    await runner.resumeQueue();
    forbidProjectWideReads(store);
    const getResearch = store.getResearch.bind(store);
    let researchReads = 0;
    store.getResearch = async (...args) => {
      researchReads += 1;
      return getResearch(...args);
    };

    const result = await drainActiveProjectsWithLeases({ store, runner });
    const article = await store.getArticle(job.articleId);

    assert.equal(result.processed, 3);
    assert.equal(result.remaining, 0);
    assert.equal(article?.jobId, job.id);
    assert.equal(researchReads, 1, "generation should load only its required research pack");
  });

  it("recovers one stale job without lists, state, or research packs", async () => {
    const { store, runner } = setup();
    const [job] = await runner.addTitles(["Targeted stale recovery"]);
    await store.saveJob({
      ...job,
      status: "processing",
      updatedAt: new Date(Date.now() - 60 * 60_000).toISOString()
    });
    forbidProjectWideReads(store);
    store.getResearch = async () => { throw new Error("stale recovery must not load research"); };

    assert.equal(await runner.reclaimStale(), 1);
    assert.equal((await store.getJob(job.id))?.status, "queued");
  });

  it("manual process-next starts one job without lists, state, or research packs", async () => {
    const { store, runner } = setup();
    await runner.addTitles(["Targeted manual generation"]);
    await runner.resumeQueue();
    forbidProjectWideReads(store);
    store.getResearch = async () => { throw new Error("research stage must not reload a research pack"); };

    const result = await runner.processNext(undefined, { source: "manual" });

    assert.equal(result.processed, true);
    assert.equal(result.job?.pipeline.find((step) => step.stage === "research")?.status, "done");
  });
});
