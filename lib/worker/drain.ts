import type { QueueRunner } from "@/lib/queue/runner";
import type { WorkspaceStore } from "@/lib/storage/storage";
import type { WorkerLeaseDocument } from "@/lib/types";
import { slugId } from "@/lib/text";

export const WORKER_LEASE_TTL_MS = 2 * 60_000;
export const WORKER_DRAIN_BUDGET_MS = 60_000;
export const WORKER_HEAVY_STAGE_START_CUTOFF_MS = 5_000;

export interface WorkerDrainResult {
  processed: number;
  remaining: number;
  durationMs: number;
  leaseAcquired: boolean;
  skippedReason?: string;
  nextJob?: WorkerQueueSnapshot["nextJob"];
  lease?: WorkerQueueSnapshot["lease"];
}

export interface WorkerProjectDrainResult extends WorkerDrainResult {
  projectId: string;
}

export interface WorkerDrainAllResult {
  projectsChecked: number;
  projectsWithWork: number;
  processed: number;
  remaining: number;
  durationMs: number;
  results: WorkerProjectDrainResult[];
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
  projectId,
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
  const resolvedProjectId = projectId ?? await store.getActiveProjectId();
  const startedAt = now();
  const leaseRequestedAt = new Date(startedAt).toISOString();
  const lease = await acquireWorkerLease(store, resolvedProjectId, now, leaseTtlMs);
  if (!lease) {
    await recordWorkerObservation(store, resolvedProjectId, {
      worker_first_seen_at: leaseRequestedAt,
      worker_lease_requested_at: leaseRequestedAt,
      worker_lease_blocked_at: new Date(now()).toISOString()
    });
    const snapshot = await getWorkerQueueSnapshot(store, resolvedProjectId, now);
    return {
      processed: 0,
      remaining: snapshot.remaining,
      durationMs: now() - startedAt,
      leaseAcquired: false,
      skippedReason: "worker lease already held",
      nextJob: snapshot.nextJob,
      lease: snapshot.lease
    };
  }

  try {
    await recordWorkerObservation(store, resolvedProjectId, {
      worker_first_seen_at: leaseRequestedAt,
      worker_lease_requested_at: leaseRequestedAt,
      worker_lease_acquired_at: lease.acquiredAt
    });
    let processed = 0;
    while (now() - startedAt < budgetMs) {
      const snapshot = await getWorkerQueueSnapshot(store, resolvedProjectId, now);
      if (now() - startedAt > heavyStageStartCutoffMs && snapshot.nextJob?.heavy) break;
      const result = await runner.processNext(resolvedProjectId, { source: "worker" });
      if (!result.processed) break;
      processed += 1;
    }
    const snapshot = await getWorkerQueueSnapshot(store, resolvedProjectId, now);
    return {
      processed,
      remaining: snapshot.remaining,
      durationMs: now() - startedAt,
      leaseAcquired: true,
      nextJob: snapshot.nextJob,
      lease: snapshot.lease
    };
  } finally {
    await releaseWorkerLease(store, lease, resolvedProjectId);
  }
}

export async function drainActiveProjectsWithLeases({
  store,
  runner,
  now = () => Date.now()
}: {
  store: WorkspaceStore;
  runner: QueueRunner;
  now?: () => number;
}): Promise<WorkerDrainAllResult> {
  const startedAt = now();
  // Worker polling must never load full project job or article collections.
  const scan = await store.getProjectQueueScan();
  const results: WorkerProjectDrainResult[] = [];

  for (const projectId of scan.projectIds) {
    const result = await drainQueueWithLease({ store, runner, projectId, now });
    results.push({ ...result, projectId });
  }

  return {
    projectsChecked: scan.projectsChecked,
    projectsWithWork: results.length,
    processed: results.reduce((total, result) => total + result.processed, 0),
    remaining: results.reduce((total, result) => total + result.remaining, 0),
    durationMs: now() - startedAt,
    results
  };
}

export async function acquireWorkerLease(
  store: WorkspaceStore,
  projectId?: string,
  now = () => Date.now(),
  leaseTtlMs = WORKER_LEASE_TTL_MS
) {
  const resolvedProjectId = projectId ?? await store.getActiveProjectId();
  const existing = await store.getWorkerLease(resolvedProjectId);
  if (existing && new Date(existing.expiresAt).getTime() > now()) return null;
  if (existing) await store.deleteWorkerLease(resolvedProjectId);

  const acquiredAtMs = now();
  const lease: WorkerLeaseDocument = {
    id: "queue-worker",
    owner: "vercel-cron",
    token: slugId("lease"),
    acquiredAt: new Date(acquiredAtMs).toISOString(),
    expiresAt: new Date(acquiredAtMs + leaseTtlMs).toISOString()
  };

  const created = await store.createWorkerLeaseIfAbsent(lease, resolvedProjectId);
  return created ? lease : null;
}

async function recordWorkerObservation(store: WorkspaceStore, projectId: string, timings: {
  worker_first_seen_at: string;
  worker_lease_requested_at: string;
  worker_lease_acquired_at?: string;
  worker_lease_blocked_at?: string;
}) {
  await store.recordWorkerObservation(timings, projectId);
}

export async function releaseWorkerLease(store: WorkspaceStore, lease: WorkerLeaseDocument, projectId?: string) {
  const resolvedProjectId = projectId ?? await store.getActiveProjectId();
  const current = await store.getWorkerLease(resolvedProjectId);
  if (current?.token === lease.token) await store.deleteWorkerLease(resolvedProjectId);
}

export async function getWorkerQueueSnapshot(store: WorkspaceStore, projectId?: string, now = () => Date.now()) {
  const resolvedProjectId = projectId ?? await store.getActiveProjectId();
  const [counts, lease, job] = await Promise.all([
    store.getCompactJobCounts(resolvedProjectId),
    store.getWorkerLease(resolvedProjectId),
    store.getQueueCandidate(resolvedProjectId)
  ]);
  const nextStage = job?.pipeline.find((step) => step.status !== "done" && step.status !== "skipped")?.stage ?? null;
  const leaseExpiresAtMs = lease ? new Date(lease.expiresAt).getTime() : null;
  return {
    counts: {
      queued: counts.queued,
      processing: counts.processing,
      generated: counts.generated,
      needsReview: counts.needsReview,
      failed: counts.failed
    },
    remaining: counts.queued + counts.processing,
    nextJob: job ? {
      id: job.id,
      articleId: job.articleId,
      title: job.title,
      status: job.status,
      attempts: job.attempts,
      updatedAt: job.updatedAt,
      nextStage,
      heavy: nextStage === "generation" || nextStage === "save" || nextStage === "validation"
    } : null,
    lease: lease ? {
      owner: lease.owner,
      acquiredAt: lease.acquiredAt,
      expiresAt: lease.expiresAt,
      expired: leaseExpiresAtMs !== null ? leaseExpiresAtMs <= now() : true
    } : null
  };
}

export type WorkerQueueSnapshot = Awaited<ReturnType<typeof getWorkerQueueSnapshot>>;
