import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { articleMarkdownPath, articlePath, debugPath, jobPath, researchPath, settingsPath, workspacePath } from "@/lib/storage/paths";

describe("storage paths", () => {
  it("keeps project documents debuggable and grouped", () => {
    assert.equal(workspacePath(), "projects/default/workspace.json");
    assert.equal(settingsPath(), "projects/default/settings.json");
    assert.equal(jobPath("job_1"), "projects/default/jobs/job_1.json");
    assert.equal(articlePath("article_1"), "projects/default/articles/article_1.json");
    assert.equal(articleMarkdownPath("article_1"), "projects/default/articles/article_1.md");
    assert.equal(researchPath("article_1"), "projects/default/research/article_1.json");
    assert.equal(debugPath("article_1"), "projects/default/debug/article_1.json");
  });
});
