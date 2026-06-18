import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getFaviconUrl } from "@/lib/ui/favicon";

describe("source favicon URL", () => {
  it("extracts a hostname from a full source URL", () => {
    assert.equal(
      getFaviconUrl("https://developers.google.com/search/docs"),
      "https://www.google.com/s2/favicons?domain=developers.google.com&sz=64"
    );
  });

  it("supports stored bare domains and safely rejects invalid values", () => {
    assert.equal(
      getFaviconUrl("example.com/path"),
      "https://www.google.com/s2/favicons?domain=example.com&sz=64"
    );
    assert.equal(getFaviconUrl("not a valid domain"), "");
    assert.equal(getFaviconUrl(""), "");
  });
});
