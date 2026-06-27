import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { audienceOptionsForIndustry, createDefaultProjectProfile, normalizeProjectProfile, snapshotProjectProfile } from "@/lib/project/profile";

describe("project profile", () => {
  it("defaults to stable v3 controlled values", () => {
    const profile = createDefaultProjectProfile();

    assert.equal(profile.profileVersion, 3);
    assert.equal(profile.regionKey, "global");
    assert.equal(profile.industryKey, "general");
    assert.equal(profile.audienceKey, "general_audience");
    assert.equal(profile.businessTypeKey, "auto_detect");
    assert.equal(profile.defaultTargetWords, 1400);
    assert.equal(profile.languageKey, "english_uk");
    assert.deepEqual(profile.editorialStandards, []);
    assert.equal(profile.additionalGuidance, "");
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
    assert.equal(profile.businessTypeKey, "auto_detect");
    assert.equal(profile.defaultTargetWords, 5000);
    assert.equal(profile.languageKey, "english_uk");
  });

  it("creates immutable generation snapshots with awareness flags", () => {
    const snapshot = snapshotProjectProfile(normalizeProjectProfile({
      regionKey: "united_kingdom",
      industryKey: "construction",
      audienceKey: "procurement_teams",
      defaultTargetWords: 2500,
      languageKey: "english_canada",
      editorialStandards: ["evidence_first", "include_faqs", "include_faqs", "invalid_standard"],
      additionalGuidance: "Use a calm editorial voice."
    }));

    assert.deepEqual({
      profileVersion: snapshot.profileVersion,
      region: snapshot.region,
      industry: snapshot.industry,
      audience: snapshot.audience,
      businessType: snapshot.businessType,
      targetWords: snapshot.targetWords,
      language: snapshot.language,
      editorialStandards: snapshot.editorialStandards,
      editorialStandardLabels: snapshot.editorialStandardLabels,
      additionalGuidance: snapshot.additionalGuidance,
      regionAwarenessActive: snapshot.regionAwarenessActive,
      industryAwarenessActive: snapshot.industryAwarenessActive,
      audienceAwarenessActive: snapshot.audienceAwarenessActive
    }, {
      profileVersion: 3,
      region: "united_kingdom",
      industry: "construction",
      audience: "procurement_teams",
      businessType: "auto_detect",
      targetWords: 2500,
      language: "english_canada",
      editorialStandards: ["evidence_first", "include_faqs"],
      editorialStandardLabels: ["Evidence-first writing", "Include FAQs"],
      additionalGuidance: "Use a calm editorial voice.",
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
