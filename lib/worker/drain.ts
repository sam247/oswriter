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
  diagnostics?: WorkerQueueSnapshot["diagnostics"];
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
      lease: snapshot.lease,
      diagnostics: snapshot.diagnostics
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
      lease: snapshot.lease,
      diagnostics: snapshot.diagnostics
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
  const timings = job?.timings;
  const configured = Boolean(process.env.CRON_SECRET);
  const lastWorkerSeenAt = timings?.worker_lease_requested_at ?? timings?.worker_first_seen_at ?? null;
  const lastWorkerTakeoverAt = timings?.worker_takeover_at ?? null;
  const diagnostics = {
    workerTakeovers: timings?.worker_takeover_count ?? 0,
    manualHandoffs: timings?.manual_handoff_count ?? 0,
    blockedContinuations: timings?.blocked_continuation_count ?? 0,
    staleRecoveries: timings?.stale_recovery_count ?? 0
  };
  const { health, detail } = classifyWorkerHealth({
    configured,
    remaining: counts.queued + counts.processing,
    leaseExpiresAtMs,
    job,
    lastWorkerSeenAt,
    now
  });
  return {
    configured,
    health,
    detail,
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
      heavy: nextStage === "generation" || nextStage === "save" || nextStage === "validation",
      executionOwner: timings?.execution_owner ?? timings?.started_by ?? "unknown",
      requestState: timings?.request_state ?? "finished",
      recoverable: Boolean(timings?.recoverable),
      lastDurableStage: timings?.last_durable_stage ?? null
    } : null,
    lease: lease ? {
      owner: lease.owner,
      acquiredAt: lease.acquiredAt,
      expiresAt: lease.expiresAt,
      expired: leaseExpiresAtMs !== null ? leaseExpiresAtMs <= now() : true
    } : null,
    diagnostics,
    lastWorkerSeenAt,
    lastWorkerTakeoverAt
  };
}

export type WorkerQueueSnapshot = Awaited<ReturnType<typeof getWorkerQueueSnapshot>>;

function classifyWorkerHealth({
  configured,
  remaining,
  leaseExpiresAtMs,
  job,
  lastWorkerSeenAt,
  now
}: {
  configured: boolean;
  remaining: number;
  leaseExpiresAtMs: number | null;
  job: Awaited<ReturnType<WorkspaceStore["getQueueCandidate"]>>;
  lastWorkerSeenAt: string | null;
  now: () => number;
}) {
  if (!configured) {
    return { health: "offline" as const, detail: "CRON_SECRET is missing. Background drain cannot authenticate." };
  }
  if (remaining === 0) {
    return { health: "ready" as const, detail: "No queued background work." };
  }
  if (leaseExpiresAtMs !== null && leaseExpiresAtMs > now()) {
    return { health: "busy" as const, detail: job?.title ? `Worker is actively draining "${job.title}".` : "Worker lease is active." };
  }
  if (job?.status === "processing" && job.timings?.request_state === "running") {
    if ((job.timings?.execution_owner ?? job.timings?.started_by) === "manual") {
      return { health: "blocked" as const, detail: "Waiting for the browser-started request to finish or time out." };
    }
    return { health: "busy" as const, detail: "Worker-owned work is still processing." };
  }
  if (job?.status === "processing" && job.timings?.recoverable) {
    return { health: "recovering" as const, detail: "A durable stage is ready for worker continuation." };
  }
  if (!lastWorkerSeenAt) {
    return { health: "offline" as const, detail: "Background worker has not observed this queue yet." };
  }
  const lastSeenAgeMs = now() - new Date(lastWorkerSeenAt).getTime();
  if (lastSeenAgeMs > Math.max(WORKER_LEASE_TTL_MS * 2, 5 * 60_000)) {
    return { health: "offline" as const, detail: "Worker has not polled recently." };
  }
  return { health: "ready" as const, detail: "Queued work is waiting for the next worker poll." };
}
