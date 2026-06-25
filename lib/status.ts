import type { JobStatus } from "@/lib/types";

export function statusFromReviewReasons(reasons: string[]): JobStatus {
  return reasons.length > 0 ? "needs_review" : "approved";
}

export function isReviewStatus(status: JobStatus) {
  return status === "needs_review";
}

export function isApprovedStatus(status: JobStatus) {
  return status === "approved" || status === "scheduled" || status === "published";
}

export function isCompletedArticleStatus(status: JobStatus) {
  return status === "generated" || status === "needs_review" || isApprovedStatus(status);
}

export function isTechnicalFailure(error: unknown) {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /openai|exa|search|blob|storage|disk|api|network|timeout|rate|unavailable|unauthorized|forbidden/i.test(message);
}
