import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapPlainSpanToMarkdownRange, normalizeMarkdownForHarper } from "@/lib/editor/harper/normalization";

describe("Harper markdown normalization", () => {
  it("removes common markdown syntax while preserving readable text", () => {
    const mapping = normalizeMarkdownForHarper("## Heading\n\n- **Strong** item with [link text](https://example.com)");

    assert.equal(mapping.text, "Heading\n\nStrong item with link text");
  });

  it("maps normalized spans back to markdown ranges", () => {
    const markdown = "Read the [docs](https://example.com) today.";
    const mapping = normalizeMarkdownForHarper(markdown);
    const plainStart = mapping.text.indexOf("docs");
    const plainEnd = plainStart + "docs".length;
    const range = mapPlainSpanToMarkdownRange(mapping, plainStart, plainEnd);

    assert.deepEqual(range, {
      start: markdown.indexOf("docs"),
      end: markdown.indexOf("docs") + 4
    });
  });
});
