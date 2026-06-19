import { getPlan } from "@/lib/billing/plans";
import type { BillingSubscription, Entitlements } from "@/lib/billing/types";

export function resolveEntitlements(subscription: BillingSubscription): Entitlements {
  const plan = getPlan(subscription.planId);
  return {
    planId: plan.id,
    limits: { ...plan.limits },
    mcpAccess: plan.limits.mcpAccess > 0,
    byokAccess: plan.limits.byokAccess > 0
  };
}
