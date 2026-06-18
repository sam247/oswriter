import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { audienceOptionsForIndustry, createDefaultProjectProfile, normalizeProjectProfile, snapshotProjectProfile } from "@/lib/project/profile";

describe("project profile", () => {
  it("defaults to stable v2 controlled values", () => {
    const profile = createDefaultProjectProfile();

    assert.equal(profile.profileVersion, 2);
    assert.equal(profile.regionKey, "global");
    assert.equal(profile.industryKey, "general");
    assert.equal(profile.audienceKey, "general_audience");
    assert.equal(profile.defaultTargetWords, 1400);
  });

  it("normalizes invalid saved combinations to the industry default", () => {
    const profile = normalizeProjectProfile({
      regionKey: "mars",
      industryKey: "healthcare",
      audienceKey: "consumers",
      defaultTargetWords: 9000
    });

    assert.equal(profile.regionKey, "global");
    assert.equal(profile.industryKey, "healthcare");
    assert.equal(profile.audienceKey, "practice_managers");
    assert.equal(profile.audienceLabel, "Practice Managers");
    assert.equal(profile.defaultTargetWords, 5000);
  });

  it("creates immutable generation snapshots with awareness flags", () => {
    const snapshot = snapshotProjectProfile(normalizeProjectProfile({
      regionKey: "united_kingdom",
      industryKey: "construction",
      audienceKey: "procurement_teams",
      defaultTargetWords: 2500
    }));

    assert.deepEqual({
      profileVersion: snapshot.profileVersion,
      region: snapshot.region,
      industry: snapshot.industry,
      audience: snapshot.audience,
      targetWords: snapshot.targetWords,
      regionAwarenessActive: snapshot.regionAwarenessActive,
      industryAwarenessActive: snapshot.industryAwarenessActive,
      audienceAwarenessActive: snapshot.audienceAwarenessActive
    }, {
      profileVersion: 2,
      region: "united_kingdom",
      industry: "construction",
      audience: "procurement_teams",
      targetWords: 2500,
      regionAwarenessActive: true,
      industryAwarenessActive: true,
      audienceAwarenessActive: true
    });
    assert.equal(snapshot.profileKey, "construction_procurement_teams");
  });

  it("returns only audiences allowed for the selected industry", () => {
    assert.deepEqual(audienceOptionsForIndustry("saas").map((option) => option.key), [
      "developers",
      "engineering_managers",
      "product_managers",
      "ctos",
      "technical_decision_makers"
    ]);
  });
});
