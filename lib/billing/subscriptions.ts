import type { BillingSubscription, PlanId } from "@/lib/billing/types";

export interface SubscriptionProvider {
  getSubscription(accountId: string): Promise<BillingSubscription | null>;
}

export function createInternalSubscription(accountId: string, planId: PlanId = "free", now = new Date()): BillingSubscription {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    id: `internal:${accountId}`,
    accountId,
    planId,
    status: "active",
    provider: "internal",
    currentPeriodStart: periodStart.toISOString(),
    currentPeriodEnd: periodEnd.toISOString()
  };
}

export class InternalSubscriptionProvider implements SubscriptionProvider {
  constructor(private readonly planId: PlanId = "free") {}

  async getSubscription(accountId: string) {
    return createInternalSubscription(accountId, this.planId);
  }
}
