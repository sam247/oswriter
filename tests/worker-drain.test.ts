import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueueRunner } from "@/lib/queue/runner";
import { createDefaultProject } from "@/lib/defaults";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { WorkspaceStore } from "@/lib/storage/storage";
import { acquireWorkerLease, drainActiveProjectsWithLeases, drainQueueWithLease, isWorkerRequestAuthorized } from "@/lib/worker/drain";
import type { ArticleGenerationInput, EditorInput, ModelAdapter, SearchAdapter, ValidationInput, ValidationResult } from "@/lib/types";

class FakeSearch implements SearchAdapter {
  async search(query: string) {
    return {
      requestId: `req_${query}`,
      results: Array.from({ length: 5 }, (_, index) => ({
        title: index === 0 ? "GOV.UK technical guidance" : `Authority source ${index}`,
        url: index === 0 ? `https://www.gov.uk/guidance/${encodeURIComponent(query)}` : `https://water.org.uk/source-${index}-${encodeURIComponent(query)}`,
        summary: "Technical guidance, requirements, standards, legislation, and practical facts.",
        highlights: ["Follow current guidance and confirm local requirements."]
      }))
    };
  }
}

class FakeModel implements ModelAdapter {
  async generateArticle(input: ArticleGenerationInput) {
    return `# ${input.title}

Intro paragraph with a direct practical answer.

## Requirements
Useful researched details.

## Process
Practical sequence.

## Costs And Timing
Plain-English explanation.

## Common Problems
Risks and checks.

## Practical Next Steps
What to do next.

## FAQ

### What should you check first?
Check current requirements first.`;
  }

  async editArticle(input: EditorInput) {
    return input.markdown;
  }

  async validateArticle(input: ValidationInput): Promise<ValidationResult> {
    return {
      pass: true,
      warnings: [],
      needsReviewReasons: [],
      qualityScore: 92,
      sectionScores: { research: input.research.confidence, intent: 90 },
      faqScore: 88,
      seoScore: 84
    };
  }
}

function setup() {
  const store = new WorkspaceStore(new MemoryStorageAdapter());
  const runner = new QueueRunner(store, new FakeSearch(), new FakeModel());
  return { store, runner };
}

describe("autonomous worker drain", () => {
  it("rejects unauthorised worker access", () => {
    process.env.CRON_SECRET = "worker-secret";
    const req = new Request("https://example.com/api/worker/drain", {
      headers: { authorization: "Bearer wrong-secret" }
    });

    assert.equal(isWorkerRequestAuthorized(req), false);
  });

  it("accepts authorised worker access", () => {
    process.env.CRON_SECRET = "worker-secret";
    const req = new Request("https://example.com/api/worker/drain", {
      headers: { authorization: "Bearer worker-secret" }
    });

    assert.equal(isWorkerRequestAuthorized(req), true);
  });

  it("acquires only one active lease", async () => {
    const { store } = setup();
    const now = () => new Date("2026-06-13T09:00:00.000Z").getTime();

    const first = await acquireWorkerLease(store, undefined, now);
    const second = await acquireWorkerLease(store, undefined, now);

    assert.ok(first);
    assert.equal(second, null);
  });

  it("recovers an expired lease", async () => {
    const { store } = setup();
    const firstNow = () => new Date("2026-06-13T09:00:00.000Z").getTime();
    const later = () => new Date("2026-06-13T09:03:00.000Z").getTime();

    const first = await acquireWorkerLease(store, undefined, firstNow, 60_000);
    const second = await acquireWorkerLease(store, undefined, later, 60_000);

    assert.ok(first);
    assert.ok(second);
    assert.notEqual(second.token, first.token);
  });

  it("prevents overlapping cron drains while a lease is held", async () => {
    const { store, runner } = setup();
    await runner.addTitles(["Overlap prevention"]);
    await acquireWorkerLease(store);

    const result = await drainQueueWithLease({ store, runner });

    assert.equal(result.leaseAcquired, false);
    assert.equal(result.processed, 0);
    assert.equal(result.remaining, 1);
  });

  it("continues queue processing without browser polling", async () => {
    const { store, runner } = setup();
    await runner.addTitles(["Worker article one", "Worker article two", "Worker article three"]);
    await runner.resumeQueue();

    const result = await drainQueueWithLease({
      store,
      runner,
      now: () => new Date("2026-06-13T09:00:00.000Z").getTime()
    });
    const state = await store.getFullState();

    assert.equal(result.leaseAcquired, true);
    assert.equal(result.remaining, 0);
    assert.equal(state.jobs.length, 3);
    assert.equal(state.articles.length, 3);
    assert.equal(state.jobs.every((job) => job.status === "generated" || job.status === "needs_review"), true);
  });

  it("drains active queue work across projects", async () => {
    const { store, runner } = setup();
    await store.saveProject({ ...createDefaultProject(), id: "project-a", name: "Project A" });
    await store.saveProject({ ...createDefaultProject(), id: "project-b", name: "Project B" });
    await runner.addTitles(["Project A title"], "project-a");
    await runner.addTitles(["Project B title"], "project-b");
    await runner.resumeQueue("project-a");
    await runner.resumeQueue("project-b");

    const result = await drainActiveProjectsWithLeases({ store, runner });
    const projectA = await store.getFullState("project-a");
    const projectB = await store.getFullState("project-b");

    assert.equal(result.projectsWithWork, 2);
    assert.equal(result.remaining, 0);
    assert.equal(projectA.articles.length, 1);
    assert.equal(projectB.articles.length, 1);
  });

  it("does not start a heavy generation step late in the drain window", async () => {
    const { store, runner } = setup();
    await runner.addTitles(["Late generation should wait"]);
    await runner.resumeQueue();
    await runner.processNext();
    await runner.processNext();
    let calls = 0;

    const result = await drainQueueWithLease({
      store,
      runner,
      now: () => calls++ === 0 ? 0 : 11_000
    });
    const state = await store.getFullState();

    assert.equal(result.leaseAcquired, true);
    assert.equal(result.processed, 0);
    assert.equal(result.remaining, 1);
    assert.equal(state.articles.length, 0);
    assert.equal(state.jobs[0].status, "processing");
  });
});
