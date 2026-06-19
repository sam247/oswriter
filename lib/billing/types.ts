export const BILLING_METRICS = ["projects", "words", "researchRuns", "exports", "mcpAccess", "byokAccess"] as const;

export type BillingMetric = (typeof BILLING_METRICS)[number];
export type PlanId = "free" | "pro" | "byok";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled";

export type PlanLimits = Record<BillingMetric, number>;

export interface BillingPlan {
  id: PlanId;
  name: string;
  description: string;
  price: { amount: number; currency: "GBP"; interval: "month" };
  limits: PlanLimits;
  highlighted?: boolean;
}

export interface BillingSubscription {
  id: string;
  accountId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  provider: "internal" | "stripe";
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

export interface Entitlements {
  planId: PlanId;
  limits: PlanLimits;
  mcpAccess: boolean;
  byokAccess: boolean;
}

export interface UsageMetricSnapshot {
  used: number;
  allowed: number;
  remaining: number;
}

export interface BillingSnapshot {
  plan: BillingPlan;
  subscription: BillingSubscription;
  entitlements: Entitlements;
  usage: Record<BillingMetric, UsageMetricSnapshot>;
  period: { start: string; end: string };
}
