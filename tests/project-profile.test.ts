import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultProjectProfile, normalizeProjectProfile, snapshotProjectProfile } from "@/lib/project/profile";

describe("project profile", () => {
  it("defaults to stable v1 controlled values", () => {
    const profile = createDefaultProjectProfile();

    assert.equal(profile.profileVersion, 1);
    assert.equal(profile.regionKey, "global");
    assert.equal(profile.industryKey, "general");
    assert.equal(profile.audienceKey, "general_audience");
    assert.equal(profile.defaultTargetWords, 1400);
  });

  it("normalizes invalid keys and supports custom industries", () => {
    const profile = normalizeProjectProfile({
      regionKey: "mars",
      industryKey: "custom",
      customIndustryLabel: "  Specialist Rail Utilities  ",
      audienceKey: "procurement_teams",
      defaultTargetWords: 9000
    });

    assert.equal(profile.regionKey, "global");
    assert.equal(profile.industryKey, "custom");
    assert.equal(profile.industryLabel, "Specialist Rail Utilities");
    assert.equal(profile.customIndustryLabel, "Specialist Rail Utilities");
    assert.equal(profile.audienceKey, "procurement_teams");
    assert.equal(profile.defaultTargetWords, 5000);
  });

  it("creates immutable generation snapshots with awareness flags", () => {
    const snapshot = snapshotProjectProfile(normalizeProjectProfile({
      regionKey: "united_kingdom",
      industryKey: "utilities",
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
      profileVersion: 1,
      region: "united_kingdom",
      industry: "utilities",
      audience: "procurement_teams",
      targetWords: 2500,
      regionAwarenessActive: true,
      industryAwarenessActive: true,
      audienceAwarenessActive: true
    });
  });
});
