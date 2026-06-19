import type { BillingPlan, PlanId } from "@/lib/billing/types";

// This catalog is the only place product limits and display pricing are defined.
export const BILLING_PLANS: readonly BillingPlan[] = [
  {
    id: "free",
    name: "Free",
    description: "For trying the core writing workflow.",
    price: { amount: 0, currency: "GBP", interval: "month" },
    limits: { projects: 1, words: 10_000, researchRuns: 5, exports: 5, mcpAccess: 0, byokAccess: 0 }
  },
  {
    id: "pro",
    name: "Pro",
    description: "For regular content production with platform AI.",
    price: { amount: 29, currency: "GBP", interval: "month" },
    limits: { projects: 10, words: 250_000, researchRuns: 100, exports: 250, mcpAccess: 1, byokAccess: 0 },
    highlighted: true
  },
  {
    id: "byok",
    name: "BYOK",
    description: "For teams using their own model and research credentials.",
    price: { amount: 19, currency: "GBP", interval: "month" },
    limits: { projects: 25, words: 1_000_000, researchRuns: 500, exports: 1_000, mcpAccess: 1, byokAccess: 1 }
  }
] as const;

export function getPlan(planId: PlanId): BillingPlan {
  const plan = BILLING_PLANS.find((candidate) => candidate.id === planId);
  if (!plan) throw new Error(`Unknown billing plan: ${planId}`);
  return plan;
}
