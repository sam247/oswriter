import type { PipelineStageName, PipelineStep } from "@/lib/types";
import { nowIso } from "@/lib/defaults";

export function startStage(pipeline: PipelineStep[], stage: PipelineStageName, message?: string): PipelineStep[] {
  return pipeline.map((step) =>
    step.stage === stage
      ? { ...step, status: "running", startedAt: nowIso(), completedAt: undefined, durationMs: undefined, message, error: undefined }
      : step
  );
}

export function completeStage(pipeline: PipelineStep[], stage: PipelineStageName, meta?: Record<string, unknown>): PipelineStep[] {
  const completedAt = nowIso();
  return pipeline.map((step) => {
    if (step.stage !== stage) return step;
    const started = step.startedAt ? new Date(step.startedAt).getTime() : Date.now();
    return {
      ...step,
      status: "done",
      completedAt,
      durationMs: Math.max(0, Date.now() - started),
      meta: { ...step.meta, ...meta }
    };
  });
}

export function failStage(pipeline: PipelineStep[], stage: PipelineStageName, error: string): PipelineStep[] {
  const completedAt = nowIso();
  return pipeline.map((step) => {
    if (step.stage !== stage) return step;
    const started = step.startedAt ? new Date(step.startedAt).getTime() : Date.now();
    return {
      ...step,
      status: "failed",
      completedAt,
      durationMs: Math.max(0, Date.now() - started),
      error
    };
  });
}

export function skipStage(pipeline: PipelineStep[], stage: PipelineStageName, message: string): PipelineStep[] {
  return pipeline.map((step) => step.stage === stage ? { ...step, status: "skipped", message } : step);
}

export function compactPipelineForJobStorage(pipeline: PipelineStep[]): PipelineStep[] {
  return pipeline.map((step) => ({
    stage: step.stage,
    status: step.status,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    durationMs: step.durationMs,
    message: step.message,
    error: step.error
  }));
}
