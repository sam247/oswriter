import { getPlan } from "@/lib/billing/plans";
import { resolveEntitlements } from "@/lib/billing/entitlements";
import { InternalSubscriptionProvider, type SubscriptionProvider } from "@/lib/billing/subscriptions";
import type { BillingSnapshot } from "@/lib/billing/types";
import { accountUsage, type UsageCounters } from "@/lib/billing/usage";

export interface UsageProvider {
  getUsage(accountId: string, period: { start: string; end: string }): Promise<Partial<UsageCounters>>;
}

export class BillingService {
  constructor(
    private readonly usage: UsageProvider,
    private readonly subscriptions: SubscriptionProvider = new InternalSubscriptionProvider()
  ) {}

  async getSnapshot(accountId: string): Promise<BillingSnapshot> {
    const resolvedSubscription = await this.subscriptions.getSubscription(accountId)
      ?? await new InternalSubscriptionProvider().getSubscription(accountId);
    const entitlements = resolveEntitlements(resolvedSubscription);
    const period = { start: resolvedSubscription.currentPeriodStart, end: resolvedSubscription.currentPeriodEnd };
    const counters = await this.usage.getUsage(accountId, period);
    return {
      plan: getPlan(resolvedSubscription.planId),
      subscription: resolvedSubscription,
      entitlements,
      usage: accountUsage(counters, entitlements),
      period
    };
  }
}
