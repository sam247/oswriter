import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import type { HarperTelemetryReport } from "@/lib/analytics/harper";
import { WorkspaceStore, type StorageProvider } from "@/lib/storage/storage";

describe("harper telemetry report", () => {
  it("delegates to the aggregate provider without listing documents", async () => {
    const expected: HarperTelemetryReport = {
      summary: {
        total_suggestions: 250,
        accepted_suggestions: 170,
        ignored_suggestions: 80,
        acceptance_rate: 68,
        ignore_rate: 32,
        top_helpful_rule: {
          rule_id: "Oxford Comma",
          category: "usage",
          total_occurrences: 40,
          accepted_count: 36,
          ignored_count: 4,
          acceptance_rate: 90,
          ignore_rate: 10
        },
        top_ignored_rule: {
          rule_id: "Passive Voice",
          category: "style",
          total_occurrences: 35,
          accepted_count: 8,
          ignored_count: 27,
          acceptance_rate: 22.9,
          ignore_rate: 77.1
        }
      },
      rule_metrics: [],
      noisy_rules: [],
      content_profile_metrics: []
    };

    const provider: StorageProvider = {
      getJson: async () => ({ projectId: "project-1" }) as never,
      putJson: async () => undefined,
      putJsonIfAbsent: async () => true,
      putText: async () => undefined,
      listJson: async () => { throw new Error("harper analytics must not list documents"); },
      listPaths: async () => [],
      deletePath: async () => undefined,
      getHarperTelemetryReport: async (projectId) => {
        assert.equal(projectId, "project-1");
        return expected;
      }
    };

    assert.deepEqual(await new WorkspaceStore(provider).getHarperTelemetryReport(), expected);
  });

  it("keeps full-state and article reads out of the route", async () => {
    const route = await readFile(new URL("../app/api/analytics/harper/route.ts", import.meta.url), "utf8");
    assert.match(route, /getHarperTelemetryReport\(\)/);
    assert.match(route, /recordHarperTelemetry\(events\)/);
    assert.doesNotMatch(route, /getState|getFullState|listArticles|getArticle/);
  });
});
