import { DEFAULT_PROJECT_ID } from "@/lib/defaults";
import type { QueueRunner } from "@/lib/queue/runner";
import type { WorkspaceStore } from "@/lib/storage/storage";
import type { WorkerLeaseDocument } from "@/lib/types";
import { slugId } from "@/lib/text";

export const WORKER_LEASE_TTL_MS = 2 * 60_000;
export const WORKER_DRAIN_BUDGET_MS = 40_000;
export const WORKER_HEAVY_STAGE_START_CUTOFF_MS = 10_000;

export interface WorkerDrainResult {
  processed: number;
  remaining: number;
  durationMs: number;
  leaseAcquired: boolean;
  skippedReason?: string;
}

export function isWorkerRequestAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authorization = req.headers.get("authorization");
  return authorization === `Bearer ${secret}`;
}

export async function drainQueueWithLease({
  store,
  runner,
  projectId = DEFAULT_PROJECT_ID,
  now = () => Date.now(),
  budgetMs = WORKER_DRAIN_BUDGET_MS,
  heavyStageStartCutoffMs = WORKER_HEAVY_STAGE_START_CUTOFF_MS,
  leaseTtlMs = WORKER_LEASE_TTL_MS
}: {
  store: WorkspaceStore;
  runner: QueueRunner;
  projectId?: string;
  now?: () => number;
  budgetMs?: number;
  heavyStageStartCutoffMs?: number;
  leaseTtlMs?: number;
}): Promise<WorkerDrainResult> {
  const startedAt = now();
  const lease = await acquireWorkerLease(store, projectId, now, leaseTtlMs);
  if (!lease) {
    const state = await store.getState(projectId);
    return {
      processed: 0,
      remaining: countRemaining(state.jobs),
      durationMs: now() - startedAt,
      leaseAcquired: false,
      skippedReason: "worker lease already held"
    };
  }

  try {
    await runner.reclaimStale(projectId);
    let processed = 0;
    while (now() - startedAt < budgetMs) {
      if (now() - startedAt > heavyStageStartCutoffMs && await nextStepIsHeavy(store, projectId)) break;
      const result = await runner.processNext(projectId);
      if (!result.processed) break;
      processed += 1;
    }
    const state = await store.getState(projectId);
    return {
      processed,
      remaining: countRemaining(state.jobs),
      durationMs: now() - startedAt,
      leaseAcquired: true
    };
  } finally {
    await releaseWorkerLease(store, lease, projectId);
  }
}

export async function acquireWorkerLease(
  store: WorkspaceStore,
  projectId = DEFAULT_PROJECT_ID,
  now = () => Date.now(),
  leaseTtlMs = WORKER_LEASE_TTL_MS
) {
  const existing = await store.getWorkerLease(projectId);
  if (existing && new Date(existing.expiresAt).getTime() > now()) return null;
  if (existing) await store.deleteWorkerLease(projectId);

  const acquiredAtMs = now();
  const lease: WorkerLeaseDocument = {
    id: "queue-worker",
    owner: "vercel-cron",
    token: slugId("lease"),
    acquiredAt: new Date(acquiredAtMs).toISOString(),
    expiresAt: new Date(acquiredAtMs + leaseTtlMs).toISOString()
  };

  const created = await store.createWorkerLeaseIfAbsent(lease, projectId);
  return created ? lease : null;
}

export async function releaseWorkerLease(store: WorkspaceStore, lease: WorkerLeaseDocument, projectId = DEFAULT_PROJECT_ID) {
  const current = await store.getWorkerLease(projectId);
  if (current?.token === lease.token) await store.deleteWorkerLease(projectId);
}

function countRemaining(jobs: Array<{ status: string }>) {
  return jobs.filter((job) => job.status === "queued" || job.status === "processing").length;
}

async function nextStepIsHeavy(store: WorkspaceStore, projectId = DEFAULT_PROJECT_ID) {
  const jobs = await store.listJobs(projectId);
  const job = jobs.find((item) => item.status === "processing") ?? jobs.find((item) => item.status === "queued");
  if (!job) return false;
  const nextStage = job.pipeline.find((step) => step.status !== "done" && step.status !== "skipped")?.stage;
  return nextStage === "generation" || nextStage === "save" || nextStage === "validation";
}
