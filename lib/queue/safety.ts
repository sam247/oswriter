import type { WorkspaceStore } from "@/lib/storage/storage";

export async function getQueueMutationBlocker(store: WorkspaceStore, projectId?: string) {
  const resolvedProjectId = projectId ?? await store.getActiveProjectId();
  const [jobs, control] = await Promise.all([
    store.listJobs(resolvedProjectId),
    store.getQueueControl(resolvedProjectId)
  ]);
  const processing = jobs.find((job) => job.status === "processing");
  if (processing) return `Queue is processing "${processing.title}". Stop after current or wait for it to finish before changing queue-critical state.`;
  if (control.mode === "stop_after_current") return "Queue is stopping after the current article. Wait until it reaches stopped state before changing queue-critical state.";
  return null;
}

export async function getSettingsMutationBlocker(store: WorkspaceStore, projectId?: string) {
  const resolvedProjectId = projectId ?? await store.getActiveProjectId();
  const jobs = await store.listJobs(resolvedProjectId);
  const active = jobs.find((job) => job.status === "queued" || job.status === "processing");
  if (!active) return null;
  return "Generation settings are locked while queued or processing articles exist.";
}
