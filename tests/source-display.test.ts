import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSourceDisplayDomain, getSourceDisplayTitle, truncateSourceTitle } from "@/lib/ui/source-display";

describe("research source display", () => {
  it("preserves a useful source title and promotes the domain separately", () => {
    const url = "https://developers.google.com/search/docs/fundamentals/seo-starter-guide";
    assert.equal(getSourceDisplayTitle("SEO Starter Guide", url), "SEO Starter Guide");
    assert.equal(getSourceDisplayDomain(url), "developers.google.com");
  });

  it("replaces Contracts Finder URL titles with a readable label", () => {
    const url = "https://contractsfinder.service.gov.uk/Notice/Attachment/affe-4633-942f";
    assert.equal(getSourceDisplayTitle(url, url, "contractsfinder.service.gov.uk"), "Contracts Finder Notice");
    assert.equal(getSourceDisplayDomain(url, "contractsfinder.service.gov.uk"), "contractsfinder.service.gov.uk");
  });

  it("never falls back to displaying a raw URL", () => {
    const url = "https://www.legislation.gov.uk/id/uksi/2025/1054";
    const title = getSourceDisplayTitle(url, url);
    assert.equal(title, "UK Legislation UKSI");
    assert.ok(!title.includes("https://"));
  });

  it("caps displayed titles at 40 characters without losing the source title", () => {
    const title = "Designing High-Throughput Multi-Tenant SaaS on Azure";
    const truncated = truncateSourceTitle(title);
    assert.ok(Array.from(truncated).length <= 40);
    assert.equal(truncated, "Designing High-Throughput Multi-Tenant…");
    assert.equal(truncateSourceTitle("Short source title"), "Short source title");
  });
});
