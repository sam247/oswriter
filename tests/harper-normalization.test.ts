import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHarperProjectDictionary, isDictionaryTerm } from "@/lib/editor/harper/dictionary";
import { mapMarkdownRangeToPlainSpan, mapPlainSpanToMarkdownRange, normalizeMarkdownForHarper } from "@/lib/editor/harper/normalization";

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

  it("round trips markdown ranges to normalized text spans", () => {
    const markdown = "## Heading\n\nUse **agreements** carefully.";
    const mapping = normalizeMarkdownForHarper(markdown);
    const markdownStart = markdown.indexOf("agreements");
    const span = mapMarkdownRangeToPlainSpan(mapping, markdownStart, markdownStart + "agreements".length);

    assert.deepEqual(span, {
      start: mapping.text.indexOf("agreements"),
      end: mapping.text.indexOf("agreements") + "agreements".length
    });
  });

  it("builds a project dictionary from brand and knowledge base terms", () => {
    const dictionary = buildHarperProjectDictionary({
      name: "QueueWrite",
      knowledgeBase: {
        brandName: "OpenRedaction",
        website: "",
        aboutBusiness: "",
        services: "PA23 planning reports\nGSC and GA4 setup",
        products: "Disclosurely",
        targetCustomer: "",
        writingRules: "Use BYOK for customer-owned keys.",
        preferredCTA: ""
      }
    });

    assert.equal(isDictionaryTerm("QueueWrite", dictionary), true);
    assert.equal(isDictionaryTerm("PA23", dictionary), true);
    assert.equal(isDictionaryTerm("Next.js", dictionary), true);
    assert.equal(isDictionaryTerm("agreements", dictionary), false);
  });
});
