export type UsageSummary = {
  planName: string;
  wordsUsed: number;
  wordsLimit: number;
  articlesGenerated: number;
  researchRequests: number;
  resetDate: string;
};

const MOCK_RESET_DAYS = 12;

export function getUsageSummary(): UsageSummary {
  const resetDate = new Date();
  resetDate.setUTCDate(resetDate.getUTCDate() + MOCK_RESET_DAYS);

  return {
    planName: "Founding Plan",
    wordsUsed: 62_400,
    wordsLimit: 250_000,
    articlesGenerated: 21,
    researchRequests: 54,
    resetDate: resetDate.toISOString()
  };
}

export function usagePercentage(usage: UsageSummary) {
  if (usage.wordsLimit <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((usage.wordsUsed / usage.wordsLimit) * 100)));
}

export function daysUntilUsageReset(usage: UsageSummary, now = new Date()) {
  const resetTime = new Date(usage.resetDate).getTime();
  if (!Number.isFinite(resetTime)) return 0;
  return Math.max(0, Math.ceil((resetTime - now.getTime()) / 86_400_000));
}

export function formatUsageNumber(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
}
