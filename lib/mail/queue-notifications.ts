import type { WorkspaceStore } from "@/lib/storage/storage";
import { getMailService, renderQueueCompletedMail } from "@/lib/mail/service";

export async function sendQueueCompletionNotification(store: WorkspaceStore, projectId: string) {
  const [preferences, project, counts] = await Promise.all([
    store.ensureWorkspacePreferences(),
    store.ensureProject(projectId),
    store.getCompactJobCounts(projectId)
  ]);
  if (!preferences.account.email || !preferences.notifications.enabled) return;

  const shouldSend = counts.failed > 0
    ? preferences.notifications.queueFailed
    : counts.needsReview > 0
      ? preferences.notifications.queueCompletedWithWarnings
      : preferences.notifications.queueCompleted;

  if (!shouldSend) return;

  await getMailService().send(renderQueueCompletedMail({
    email: preferences.account.email,
    workspaceName: preferences.account.workspaceName || project.project.name,
    projectName: project.project.name,
    generated: counts.generated,
    needsReview: counts.needsReview,
    failed: counts.failed
  }));
}
