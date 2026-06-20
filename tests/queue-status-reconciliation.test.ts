import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileQueueStatusState } from "@/components/writer-app";
import { createDefaultProject, createDefaultQueueControl, createDefaultSettings, createDefaultWorkspacePreferences, createPipeline } from "@/lib/defaults";
import type { AppState, QueueJob, QueueStatus } from "@/lib/types";

const job: QueueJob = {
  id: "job-1",
  projectId: "default",
  articleId: "article-1",
  title: "Pipeline visibility",
  status: "processing",
  createdAt: "2026-06-20T12:00:00.000Z",
  updatedAt: "2026-06-20T12:00:10.000Z",
  attempts: 1,
  needsReviewReasons: [],
  pipeline: createPipeline().map((step) => step.stage === "research" ? { ...step, status: "done" as const } : step)
};

const state: AppState = {
  project: createDefaultProject(),
  settings: createDefaultSettings(),
  preferences: createDefaultWorkspacePreferences(),
  queueControl: createDefaultQueueControl(),
  jobs: [job],
  articles: []
};

describe("queue status reconciliation", () => {
  it("uses the active job projection to advance the visible pipeline", () => {
    const pipeline = job.pipeline.map((step) => step.stage === "outline" ? { ...step, status: "running" as const } : step);
    const status: QueueStatus = {
      queued: 0, processing: 1, generated: 8, review: 0, failed: 0,
      activeJob: { id: job.id, title: job.title, pipeline, updatedAt: "2026-06-20T12:00:20.000Z" }
    };
    const next = reconcileQueueStatusState(state, status);
    assert.equal(next.jobs[0]?.status, "processing");
    assert.equal(next.jobs[0]?.pipeline.find((step) => step.stage === "outline")?.status, "running");
  });

  it("never guesses an individual completion from aggregate counts", () => {
    const status: QueueStatus = { queued: 0, processing: 0, generated: 9, review: 0, failed: 0 };
    const next = reconcileQueueStatusState(state, status);
    assert.equal(next.jobs[0]?.status, "processing");
    assert.equal(next.jobs[0]?.pipeline.find((step) => step.stage === "generation")?.status, "idle");
  });
});
