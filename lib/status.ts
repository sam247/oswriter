import type { JobStatus } from "@/lib/types";

export function statusFromReviewReasons(reasons: string[]): JobStatus {
  return reasons.length > 0 ? "needs_review" : "generated";
}

export function isTechnicalFailure(error: unknown) {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /openai|exa|search|blob|storage|disk|api|network|timeout|rate|unavailable|unauthorized|forbidden/i.test(message);
}
