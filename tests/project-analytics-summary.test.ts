import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import type { ProjectAnalyticsSummary } from "@/lib/analytics/summary";
import { WorkspaceStore, type StorageProvider } from "@/lib/storage/storage";

describe("aggregate project analytics", () => {
  it("delegates to the aggregate provider without listing documents", async () => {
    const expected: ProjectAnalyticsSummary = {
      article_count: 13,
      generated_count: 10,
      review_count: 3,
      failed_count: 0,
      average_quality: 98,
      average_research: 98,
      average_evidence: 98,
      total_words: 41_775,
      source_count: 147
    };
    const provider: StorageProvider = {
      getJson: async () => ({ projectId: "project-1" }) as never,
      putJson: async () => undefined,
      putJsonIfAbsent: async () => true,
      putText: async () => undefined,
      listJson: async () => { throw new Error("analytics must not list documents"); },
      listPaths: async () => [],
      deletePath: async () => undefined,
      getProjectAnalytics: async (projectId) => {
        assert.equal(projectId, "project-1");
        return expected;
      }
    };

    assert.deepEqual(await new WorkspaceStore(provider).getProjectAnalytics(), expected);
  });

  it("keeps full-state and research reads out of the route", async () => {
    const route = await readFile(new URL("../app/api/analytics/project/route.ts", import.meta.url), "utf8");
    assert.match(route, /getProjectAnalytics\(\)/);
    assert.doesNotMatch(route, /getState|getFullState|listArticles|getResearch/);
  });
});
