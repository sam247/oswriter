import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveEntitlements } from "@/lib/billing/entitlements";
import { BILLING_PLANS, getPlan } from "@/lib/billing/plans";
import { createInternalSubscription } from "@/lib/billing/subscriptions";
import { BILLING_METRICS } from "@/lib/billing/types";
import { accountUsage } from "@/lib/billing/usage";

describe("billing foundations", () => {
  it("defines every entitlement through the configurable plan catalog", () => {
    assert.deepEqual(BILLING_PLANS.map((plan) => plan.id), ["free", "pro", "byok"]);
    for (const plan of BILLING_PLANS) assert.deepEqual(Object.keys(plan.limits), [...BILLING_METRICS]);
  });

  it("resolves access flags without coupling entitlements to a payment provider", () => {
    const subscription = createInternalSubscription("workspace-1", "byok", new Date("2026-06-19T12:00:00Z"));
    const entitlements = resolveEntitlements(subscription);
    assert.equal(subscription.provider, "internal");
    assert.equal(entitlements.mcpAccess, true);
    assert.equal(entitlements.byokAccess, true);
  });

  it("reports used, allowed and remaining for every metric", () => {
    const entitlements = resolveEntitlements(createInternalSubscription("workspace-1", "free"));
    const snapshot = accountUsage({ projects: 2, words: 12_000, researchRuns: 2 }, entitlements);
    for (const metric of BILLING_METRICS) {
      assert.equal(typeof snapshot[metric].used, "number");
      assert.equal(typeof snapshot[metric].allowed, "number");
      assert.equal(typeof snapshot[metric].remaining, "number");
    }
    assert.deepEqual(snapshot.projects, { used: 2, allowed: getPlan("free").limits.projects, remaining: 0 });
    assert.equal(snapshot.words.remaining, 0);
  });
});
