import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeProjectProfile, snapshotProjectProfile } from "@/lib/project/profile";
import { extractFacts, extractResearchConcepts, runResearch } from "@/lib/research/research-engine";
import type { ResearchSource, SearchAdapter } from "@/lib/types";

test("extractFacts decomposes long summaries into attributed useful facts", () => {
  const sources: ResearchSource[] = [
    {
      id: "src_1",
      title: "Foundation contractor guidance",
      url: "https://example.com/foundation-contractors",
      domain: "example.com",
      summary: `Summary: Foundation Contractors Guide

- Key takeaways:
  - Start with an independent structural engineer assessment before requesting bids because it defines the scope and reduces upselling risk.
  - Verify licensing, insurance and bonding before hiring a foundation contractor because requirements vary by state and project type.
  - Contractors should provide written diagnostic reports with measurements, repair scope, warranty terms and payment milestones before work starts.
  - Homeowners should treat widening cracks, sticking doors and uneven floors as signals that professional foundation inspection may be required.`,
      highlights: [],
      authorityScore: 82,
      relevanceScore: 92,
      accepted: true
    }
  ];

  const facts = extractFacts(sources);

  assert.ok(facts.length >= 3);
  assert.equal(facts[0].sourceId, "src_1");
  assert.ok(facts.every((fact) => fact.fact.length >= 45));
  assert.ok(facts.some((fact) => /licensing, insurance and bonding/i.test(fact.fact)));
});

test("runResearch applies lightweight profile source bias without stuffing queries", async () => {
  const queries: string[] = [];
  const profileSnapshot = snapshotProjectProfile(normalizeProjectProfile({
    regionKey: "united_kingdom",
    industryKey: "construction",
    audienceKey: "project_managers"
  }));
  const search: SearchAdapter = {
    async search(query) {
      queries.push(query);
      return {
        requestId: `req_${query}`,
        results: [
          {
            title: "UK construction guidance",
            url: `https://www.gov.uk/guidance/${encodeURIComponent(query)}`,
            summary: "Foundation contractors should follow British construction standards and engineering guidance for technical professionals.",
            highlights: ["UK construction projects should follow relevant standards and regulations."]
          },
          {
            title: "Generic blog",
            url: `https://example.com/${encodeURIComponent(query)}`,
            summary: "A generic overview for readers.",
            highlights: ["Simple overview."]
          }
        ]
      };
    }
  };

  const research = await runResearch("Foundation Contractors Guide", "article_test", search, profileSnapshot);

  assert.ok(research.sources.some((source) => /gov\.uk/.test(source.domain)));
  assert.ok(queries.every((query) => !/technical professionals/i.test(query)));
  assert.ok(queries.every((query) => !/technical professionals|construction technical/i.test(query)));
  assert.ok((research.profileRelevanceScore ?? 0) > 60);
});

test("extractResearchConcepts captures lightweight topic breadth from research text", () => {
  const concepts = extractResearchConcepts("REST API Authentication Methods", [
    {
      id: "src_1",
      title: "REST API authentication guide",
      url: "https://example.com/api-auth",
      domain: "example.com",
      summary: "Common REST API authentication methods include Basic Authentication, API keys, sessions, JWT, OAuth 2.0, OpenID Connect, mutual TLS, and signed requests.",
      highlights: ["Bearer tokens, refresh tokens, permissions and scopes are important for API authentication design."],
      authorityScore: 90,
      relevanceScore: 94,
      accepted: true
    }
  ]);

  for (const expected of ["Basic Authentication", "API Keys", "Sessions", "JWT", "OAuth 2.0", "OpenID Connect", "Mutual TLS", "Signed Requests"]) {
    assert.ok(concepts.includes(expected), `${expected} should be extracted`);
  }
  assert.ok(concepts.length <= 20);
});

test("runResearch preserves accepted and rejected source status while populating useful facts", async () => {
  const search: SearchAdapter = {
    async search(query) {
      return {
        requestId: `req_${query}`,
        results: Array.from({ length: 5 }, (_, index) => {
          const globalIndex = Number(query.length + index);
          return {
            title: `Foundation contractor source ${globalIndex}`,
            url: `https://example.com/foundation-${encodeURIComponent(query)}-${index}`,
            summary: "Foundation contractors should provide written diagnostic reports, verify licensing and insurance, explain repair scope, and document warranty terms before work starts.",
            highlights: ["Independent structural assessments help compare foundation contractor bids against a consistent repair scope."]
          };
        })
      };
    }
  };

  const research = await runResearch("Foundation Contractors Guide", "article_test", search);

  assert.ok(research.usefulFacts.length > 0);
  assert.equal(research.usefulFactSources?.length, research.usefulFacts.length);
  assert.equal(research.sources.every((source) => source.accepted), true);
  assert.equal(research.rejectedSources.every((source) => !source.accepted), true);
  assert.ok(research.rejectedSources.length > 0);
});

test("runResearch excludes project-owned domains and subdomains before scoring", async () => {
  const excludeDomains: string[][] = [];
  const search: SearchAdapter = {
    async search(query, options) {
      excludeDomains.push(options.excludeDomains ?? []);
      return {
        requestId: `req_${query}`,
        results: [
          {
            title: `Mainline utility diversions ${query}`,
            url: `https://mainlinegroundworks.co.uk/utility-diversions-${encodeURIComponent(query)}`,
            summary: "Utility diversions costs lead times procurement risks for UK groundworks projects.",
            highlights: ["Client-owned content should not be used as independent research."]
          },
          {
            title: `Mainline blog utility diversions ${query}`,
            url: `https://blog.mainlinegroundworks.co.uk/utility-diversions-${encodeURIComponent(query)}`,
            summary: "Utility diversions costs lead times procurement risks for UK groundworks projects.",
            highlights: ["Project subdomains should be excluded too."]
          },
          ...Array.from({ length: 3 }, (_, index) => ({
            title: `External utility diversions source ${index} ${query}`,
            url: `https://external-${index}-${query.length}.example.org/utility-diversions-${encodeURIComponent(query)}`,
            summary: "Utility diversions costs lead times procurement risks and requirements for UK groundworks projects.",
            highlights: ["Independent evidence explains utility diversion planning, procurement, standards, and risks."]
          }))
        ]
      };
    }
  };

  const research = await runResearch("Utility Diversions Explained", "article_test", search, undefined, "industry_explainer", "queuewrite", {
    projectWebsite: "https://www.mainlinegroundworks.co.uk"
  });
  assert.ok(excludeDomains.every((domains) => domains.includes("mainlinegroundworks.co.uk")));
  assert.equal(research.sources.some((source) => source.domain.endsWith("mainlinegroundworks.co.uk")), false);
  assert.ok(research.rejectedSources.some((source) => source.rejectionReason === "Same project domain."));
  assert.equal(research.researchSummary?.rejected["Same project domain"], 12);
  assert.equal(research.sources.length, 12);
});

test("runResearch allows project-owned sources for explicit site audit style requests", async () => {
  const search: SearchAdapter = {
    async search(query) {
      return {
        requestId: `req_${query}`,
        results: [
          {
            title: `Mainline existing content ${query}`,
            url: `https://blog.mainlinegroundworks.co.uk/existing-article-${encodeURIComponent(query)}`,
            summary: "Utility diversions costs lead times procurement risks for UK groundworks projects.",
            highlights: ["Existing website content can be used when explicitly requested."]
          },
          {
            title: `External utility diversions source ${query}`,
            url: `https://external-${query.length}.example.org/utility-diversions-${encodeURIComponent(query)}`,
            summary: "Utility diversions costs lead times procurement risks and requirements for UK groundworks projects.",
            highlights: ["Independent evidence explains utility diversion planning, procurement, standards, and risks."]
          }
        ]
      };
    }
  };

  const research = await runResearch("Rewrite this page about utility diversions", "article_test", search, undefined, "industry_explainer", "queuewrite", {
    projectWebsite: "mainlinegroundworks.co.uk",
    allowProjectSources: true
  });

  assert.ok(research.sources.some((source) => source.domain === "blog.mainlinegroundworks.co.uk"));
});

test("runResearch records source classes and rejection summary for duplicate and neutral sources", async () => {
  const search: SearchAdapter = {
    async search(query) {
      return {
        requestId: `req_${query}`,
        results: [
          {
            title: `Government utility diversions ${query}`,
            url: `https://www.gov.uk/guidance/utility-diversions-${encodeURIComponent(query)}`,
            summary: "Utility diversions costs lead times procurement risks and requirements for UK groundworks projects.",
            highlights: ["Government guidance explains utility diversion planning requirements."]
          },
          {
            title: `Government utility diversions duplicate ${query}`,
            url: `https://www.gov.uk/guidance/utility-diversions-${encodeURIComponent(query)}`,
            summary: "Utility diversions costs lead times procurement risks and requirements for UK groundworks projects.",
            highlights: ["Duplicate URL should be counted as rejected."]
          },
          {
            title: `Forum utility diversions ${query}`,
            url: `https://reddit.com/r/construction/comments/${encodeURIComponent(query)}`,
            summary: "Utility diversions costs lead times procurement risks and requirements for UK groundworks projects.",
            highlights: ["Forum discussion should be classified as neutral."]
          },
          {
            title: `Spam coupon utility diversions ${query}`,
            url: `https://coupon-spam.example.com/utility-diversions-${encodeURIComponent(query)}`,
            summary: "Utility diversions costs lead times procurement risks and requirements for UK groundworks projects.",
            highlights: ["Spam source should be rejected."]
          }
        ]
      };
    }
  };

  const research = await runResearch("Utility Diversions Explained", "article_test", search);

  assert.ok(research.sources.some((source) => source.sourceCategory === "government"));
  assert.ok(research.sources.some((source) => source.sourceClass === "neutral" && source.sourceCategory === "reddit"));
  assert.ok((research.researchSummary?.rejected["Duplicate URL"] ?? 0) > 0);
  assert.ok((research.researchSummary?.rejected["Obvious spam"] ?? 0) > 0);
  assert.ok((research.researchSummary?.sourceClasses.allowed ?? 0) > 0);
  assert.ok((research.researchSummary?.sourceClasses.neutral ?? 0) > 0);
  assert.ok((research.researchSummary?.sourceClasses.excluded ?? 0) > 0);
});
