import { BILLING_METRICS, type BillingMetric, type Entitlements, type UsageMetricSnapshot } from "@/lib/billing/types";

export type UsageCounters = Record<BillingMetric, number>;

export const EMPTY_USAGE: UsageCounters = {
  projects: 0,
  words: 0,
  researchRuns: 0,
  exports: 0,
  mcpAccess: 0,
  byokAccess: 0
};

export function accountUsage(counters: Partial<UsageCounters>, entitlements: Entitlements): Record<BillingMetric, UsageMetricSnapshot> {
  return Object.fromEntries(BILLING_METRICS.map((metric) => {
    const used = Math.max(0, Math.floor(counters[metric] ?? 0));
    const allowed = Math.max(0, entitlements.limits[metric]);
    return [metric, { used, allowed, remaining: Math.max(0, allowed - used) }];
  })) as Record<BillingMetric, UsageMetricSnapshot>;
}

export function usagePercent(metric: UsageMetricSnapshot) {
  if (metric.allowed <= 0) return metric.used > 0 ? 100 : 0;
  return Math.min(100, Math.round((metric.used / metric.allowed) * 100));
}
