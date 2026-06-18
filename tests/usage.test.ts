import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { daysUntilUsageReset, getUsageSummary, usagePercentage } from "@/lib/usage/usage";

describe("usage summary", () => {
  it("exposes the mock account usage through one provider", () => {
    const usage = getUsageSummary();

    assert.equal(usage.planName, "Founding Plan");
    assert.equal(usage.wordsUsed, 62_400);
    assert.equal(usage.wordsLimit, 250_000);
    assert.equal(usagePercentage(usage), 25);
  });

  it("clamps percentages and reset countdowns", () => {
    const usage = { ...getUsageSummary(), wordsUsed: 300_000, resetDate: "2026-07-01T00:00:00.000Z" };

    assert.equal(usagePercentage(usage), 100);
    assert.equal(daysUntilUsageReset(usage, new Date("2026-06-18T00:00:00.000Z")), 13);
    assert.equal(daysUntilUsageReset(usage, new Date("2026-07-02T00:00:00.000Z")), 0);
  });
});
