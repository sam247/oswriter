import type { StorageProvider } from "@/lib/storage/storage";
import type { QueueJob } from "@/lib/types";

type SharedMemoryBuckets = Map<string, Map<string, string>>;

type MemoryStorageAdapterOptions = {
  sharedKey?: string;
};

export class MemoryStorageAdapter implements StorageProvider {
  private readonly docs: Map<string, string>;

  constructor(options: MemoryStorageAdapterOptions = {}) {
    this.docs = options.sharedKey ? sharedDocs(options.sharedKey) : new Map<string, string>();
  }

  async getJson<T>(path: string): Promise<T | null> {
    const raw = this.docs.get(path);
    return raw ? JSON.parse(raw) as T : null;
  }

  async putJson<T>(path: string, value: T): Promise<void> {
    this.docs.set(path, JSON.stringify(value));
  }

  async putJsonIfAbsent<T>(path: string, value: T): Promise<boolean> {
    if (this.docs.has(path)) return false;
    this.docs.set(path, JSON.stringify(value));
    return true;
  }

  async putText(path: string, value: string): Promise<void> {
    this.docs.set(path, value);
  }

  async listJson<T>(prefix: string): Promise<T[]> {
    return [...this.docs.entries()]
      .filter(([path]) => path.startsWith(prefix) && path.endsWith(".json"))
      .map(([, raw]) => JSON.parse(raw) as T);
  }

  async listPaths(prefix: string): Promise<string[]> {
    return [...this.docs.keys()].filter((path) => path.startsWith(prefix));
  }

  async deletePath(path: string): Promise<void> {
    this.docs.delete(path);
  }

  async getProjectQueueScan() {
    const projectIds = new Set<string>();
    const activeProjectIds = new Set<string>();
    for (const [path, raw] of this.docs) {
      const match = /^projects\/([^/]+)\//.exec(path);
      if (match) projectIds.add(match[1]);
      if (!path.includes("/jobs/") || !path.endsWith(".json")) continue;
      const job = JSON.parse(raw) as QueueJob;
      if (job.status === "queued" || job.status === "processing") activeProjectIds.add(job.projectId);
    }
    return { projectsChecked: projectIds.size, projectIds: [...activeProjectIds] };
  }

  async getCompactJobCounts(projectId: string) {
    const jobs = this.jobs(projectId);
    return {
      queued: jobs.filter((job) => job.status === "queued").length,
      processing: jobs.filter((job) => job.status === "processing").length,
      generated: jobs.filter((job) => job.status === "generated").length,
      needsReview: jobs.filter((job) => job.status === "needs_review").length,
      failed: jobs.filter((job) => job.status === "failed" || job.status === "research_failed").length
    };
  }

  async getQueueCandidate(projectId: string) {
    const jobs = this.jobs(projectId);
    return jobs.find((job) => job.status === "processing") ?? jobs.find((job) => job.status === "queued") ?? null;
  }

  async getActiveProcessingJob(projectId: string) {
    return this.jobs(projectId).find((job) => job.status === "processing") ?? null;
  }

  async getNextQueuedJob(projectId: string) {
    return this.jobs(projectId).find((job) => job.status === "queued") ?? null;
  }

  async getResumableQueuedJob(projectId: string) {
    return this.jobs(projectId).find((job) => job.status === "queued" && (
      job.attempts > 0 || job.pipeline.some((step) => step.status === "done" || step.status === "running")
    )) ?? null;
  }

  async getStaleProcessingJobs(projectId: string, cutoff: string) {
    return this.jobs(projectId).filter((job) => job.status === "processing" && job.updatedAt < cutoff);
  }

  async getLatestQueuePosition(projectId: string) {
    return this.jobs(projectId).reduce((max, job) => Math.max(max, job.queuePosition ?? new Date(job.createdAt).getTime()), 0);
  }

  async recordWorkerObservation(projectId: string, timings: import("@/lib/storage/storage").WorkerObservationTimings) {
    for (const job of this.jobs(projectId).filter((item) => item.status === "queued" || item.status === "processing")) {
      const next = {
        ...job,
        timings: {
          ...job.timings,
          worker_first_seen_at: job.timings?.worker_first_seen_at ?? timings.worker_first_seen_at,
          worker_lease_requested_at: job.timings?.worker_lease_requested_at ?? timings.worker_lease_requested_at,
          worker_lease_acquired_at: job.timings?.worker_lease_acquired_at ?? timings.worker_lease_acquired_at,
          worker_lease_blocked_at: job.timings?.worker_lease_blocked_at ?? timings.worker_lease_blocked_at
        }
      };
      this.docs.set(`projects/${projectId}/jobs/${job.id}.json`, JSON.stringify(next));
    }
  }

  private jobs(projectId: string) {
    return [...this.docs.entries()]
      .filter(([path]) => path.startsWith(`projects/${projectId}/jobs/`) && path.endsWith(".json"))
      .map(([, raw]) => JSON.parse(raw) as QueueJob)
      .sort((a, b) => (a.queuePosition ?? new Date(a.createdAt).getTime()) - (b.queuePosition ?? new Date(b.createdAt).getTime()) || a.createdAt.localeCompare(b.createdAt));
  }
}

export function resetSharedMemoryStorage() {
  sharedBuckets().clear();
}

function sharedDocs(key: string) {
  const buckets = sharedBuckets();
  const existing = buckets.get(key);
  if (existing) return existing;
  const created = new Map<string, string>();
  buckets.set(key, created);
  return created;
}

function sharedBuckets() {
  const scope = globalThis as typeof globalThis & {
    __queuewriteSharedMemoryStorage__?: SharedMemoryBuckets;
  };
  scope.__queuewriteSharedMemoryStorage__ ??= new Map<string, Map<string, string>>();
  return scope.__queuewriteSharedMemoryStorage__;
}
