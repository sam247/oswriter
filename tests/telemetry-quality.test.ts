import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateTelemetryQuality, qualityBandFor } from "@/lib/telemetry/quality";

describe("telemetry-derived quality score", () => {
  it("returns 100 for telemetry that fully achieves every component", () => {
    const result = calculateTelemetryQuality({
      targetAchievementPercent: 105,
      plannedH2Count: 6,
      actualH2Count: 6,
      plannedH3Count: 12,
      actualH3Count: 12,
      actualBreadthCoveragePercent: 100,
      plannerOutcome: "matched_plan",
      breadthStatus: "sufficient",
      researchConceptCount: 20,
      sourcesAccepted: 10
    });

    assert.equal(result.qualityScore, 100);
    assert.equal(result.qualityBand, "Excellent");
  });

  it("weights a weaker result without penalising zero planned H3s", () => {
    const result = calculateTelemetryQuality({
      targetAchievementPercent: 80,
      plannedH2Count: 5,
      actualH2Count: 4,
      plannedH3Count: 0,
      actualH3Count: 0,
      actualBreadthCoveragePercent: 60,
      plannerOutcome: "under_depth",
      breadthStatus: "undercovered",
      researchConceptCount: 10,
      sourcesAccepted: 5
    });

    assert.deepEqual(result.components, { target: 84, h2: 80, h3: 100, breadth: 60, depth: 70, research: 50 });
    assert.equal(result.qualityScore, 76);
    assert.equal(result.qualityBand, "Acceptable");
  });

  it("uses underplanned depth and caps breadth and research", () => {
    const result = calculateTelemetryQuality({
      targetAchievementPercent: 100,
      plannedH2Count: 4,
      actualH2Count: 4,
      plannedH3Count: 0,
      actualH3Count: 2,
      actualBreadthCoveragePercent: 150,
      plannerOutcome: "matched_plan",
      breadthStatus: "underplanned",
      researchConceptCount: 100,
      sourcesAccepted: 100
    });

    assert.equal(result.components.depth, 60);
    assert.equal(result.components.research, 100);
    assert.equal(result.components.breadth, 100);
  });

  it("maps every boundary to the required band", () => {
    assert.deepEqual([90, 89, 80, 79, 70, 69, 60, 59, 0].map(qualityBandFor), [
      "Excellent", "Good", "Good", "Acceptable", "Acceptable", "Weak", "Weak", "Poor", "Poor"
    ]);
  });
});
