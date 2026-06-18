import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { WorkspaceStore, type StorageProvider } from "@/lib/storage/storage";
import type { QueueStatus } from "@/lib/types";

describe("lightweight queue status", () => {
  it("delegates to the provider without listing full project documents", async () => {
    const expected: QueueStatus = {
      queued: 2,
      processing: 1,
      generated: 8,
      review: 3,
      failed: 1,
      activeJob: { id: "job-1", title: "Active article" }
    };
    const provider: StorageProvider = {
      getJson: async () => ({ projectId: "project-1" }) as never,
      putJson: async () => undefined,
      putJsonIfAbsent: async () => true,
      putText: async () => undefined,
      listJson: async () => { throw new Error("queue status must not list full documents"); },
      listPaths: async () => [],
      deletePath: async () => undefined,
      getQueueStatus: async (projectId) => {
        assert.equal(projectId, "project-1");
        return expected;
      }
    };

    assert.deepEqual(await new WorkspaceStore(provider).getQueueStatus(), expected);
  });

  it("keeps full state out of the queue status route", async () => {
    const route = await readFile(new URL("../app/api/queue/status/route.ts", import.meta.url), "utf8");
    assert.match(route, /getQueueStatus\(\)/);
    assert.doesNotMatch(route, /getState\(/);
  });
});
