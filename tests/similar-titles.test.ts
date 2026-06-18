import assert from "node:assert/strict";
import { test } from "node:test";
import { generateSimilarArticleTitles } from "@/lib/generation/similar-titles";
import { normalizeProjectProfile, snapshotProjectProfile } from "@/lib/project/profile";

test("similar title generation removes project duplicates and repeated model output", async () => {
  const titles = await generateSimilarArticleTitles({
    title: "Utility Diversions Explained",
    markdown: "# Utility Diversions Explained",
    profileSnapshot: snapshotProjectProfile(normalizeProjectProfile({ industryKey: "construction", audienceKey: "procurement_teams" })),
    existingTitles: ["Who Pays for Utility Diversions?"],
    count: 10
  }, {
    async generateSimilarTitles() {
      return [
        "Who Pays for Utility Diversions?",
        "Utility Diversion Delays Explained",
        "Utility Diversion Delays Explained",
        "Utility Diversion Lead Times by Utility Type",
        "Common Utility Diversion Mistakes",
        "Utility Diversion Risk Management",
        "Utility Diversion Procurement Strategy"
      ];
    }
  });

  assert.deepEqual(titles, [
    "Utility Diversion Delays Explained",
    "Utility Diversion Lead Times by Utility Type",
    "Common Utility Diversion Mistakes",
    "Utility Diversion Risk Management",
    "Utility Diversion Procurement Strategy"
  ]);
});
