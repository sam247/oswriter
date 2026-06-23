import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHarperProjectDictionary } from "@/lib/editor/harper/dictionary";
import { shouldSurfaceHarperSuggestion } from "@/lib/editor/harper/filtering";

describe("Harper suggestion filtering", () => {
  it("suppresses DeepL to Deep", () => {
    const dictionary = buildHarperProjectDictionary();

    assert.equal(shouldSurfaceHarperSuggestion({
      category: "spelling",
      dictionary,
      kind: "Spelling",
      message: "Possible spelling mistake.",
      problemText: "DeepL",
      replacementText: "Deep"
    }), false);
  });

  it("suppresses Waze to Wade", () => {
    assert.equal(shouldSurfaceHarperSuggestion({
      category: "spelling",
      dictionary: new Set<string>(),
      kind: "Spelling",
      message: "Possible spelling mistake.",
      problemText: "Waze",
      replacementText: "Wade"
    }), false);
  });

  it("suppresses QueueWrite to Queue Write", () => {
    const dictionary = buildHarperProjectDictionary();

    assert.equal(shouldSurfaceHarperSuggestion({
      category: "style",
      dictionary,
      kind: "WordChoice",
      message: "Consider revising this wording.",
      problemText: "QueueWrite",
      replacementText: "Queue Write"
    }), false);
  });

  it("suppresses s278 to sac", () => {
    const dictionary = buildHarperProjectDictionary();

    assert.equal(shouldSurfaceHarperSuggestion({
      category: "spelling",
      dictionary,
      kind: "Spelling",
      message: "Possible spelling mistake.",
      problemText: "s278",
      replacementText: "sac"
    }), false);
  });
});
