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
    audienceKey: "technical_professionals"
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
