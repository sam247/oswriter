import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySeoRecommendations, applySelectedInternalLinks, buildSeoDecisionEngine } from "@/lib/seo/decision-engine";
import { createDefaultProjectProfile } from "@/lib/project/profile";
import type { ArticleDocument, ResearchPack, SiteKnowledgePageDocument, ProjectSiteProfileDocument } from "@/lib/types";

describe("SEO decision engine", () => {
  it("prioritises objective fixes and removes them after application", () => {
    const article = articleFixture();
    const initial = buildSeoDecisionEngine({ article, markdown: article.markdown });

    assert.equal(initial.recommendations[0]?.section, "fix");
    assert.ok(initial.recommendations.some((item) => item.id === "add-faq"));
    assert.ok(initial.recommendations.some((item) => item.id === "cite-sources"));

    const improvedMarkdown = applySeoRecommendations(article.markdown, initial.recommendations);
    const improved = buildSeoDecisionEngine({ article, markdown: improvedMarkdown });

    assert.ok(improved.score > initial.score);
    assert.ok(!improved.recommendations.some((item) => item.id === "add-faq"));
    assert.ok(!improved.recommendations.some((item) => item.id === "cite-sources"));
  });

  it("uses real research and project profile values for actionable improvements", () => {
    const article = articleFixture();
    const profile = { ...createDefaultProjectProfile(), regionKey: "united_kingdom", regionLabel: "United Kingdom", industryKey: "construction", industryLabel: "Construction", audienceKey: "project_managers", audienceLabel: "Project Managers" };
    const result = buildSeoDecisionEngine({ article, markdown: article.markdown, research: researchFixture(), profile });

    assert.ok(result.recommendations.some((item) => item.id === "insert-statistics"));
    assert.ok(result.recommendations.some((item) => item.id === "add-region-context"));
    assert.ok(result.recommendations.some((item) => item.id === "align-audience"));
    assert.ok(result.recommendations.every((item) => item.currentText && item.proposedText && item.difference));
  });

  it("does not recommend FAQ when a traditional FAQ heading is present", () => {
    const article = articleFixture();
    const markdown = `${article.markdown}\n\n## Frequently Asked Questions\n\n### What should readers know first?\nThey should understand the practical context.`;
    const result = buildSeoDecisionEngine({ article, markdown });

    assert.ok(!result.recommendations.some((item) => item.id === "add-faq"));
  });

  it("does not recommend FAQ when three question-style H2/H3 headings are present", () => {
    const article = articleFixture();
    const markdown = `${article.markdown}\n\n## What should a tender pack include?\nIt needs drawings and risk notes.\n\n## When should surveys be commissioned?\nEarly enough to inform pricing.\n\n### How should bidders price uncertainty?\nThey should separate assumptions from fixed scope.`;
    const result = buildSeoDecisionEngine({ article, markdown });

    assert.ok(!result.recommendations.some((item) => item.id === "add-faq"));
  });

  it("treats mixed FAQ structures as complete coverage", () => {
    const article = articleFixture();
    const markdown = `${article.markdown}\n\n## Common Questions\n\n### Can work start before final permits?\nOnly when the risk is understood.\n\n## Delivery Risks\n\n### Which constraints affect mobilisation?\nAccess, surveys, and utility approvals.`;
    const result = buildSeoDecisionEngine({ article, markdown });

    assert.ok(!result.recommendations.some((item) => item.id === "add-faq"));
  });

  it("shows the missing FAQ recommendation when there is no FAQ content", () => {
    const article = articleFixture();
    const result = buildSeoDecisionEngine({ article, markdown: article.markdown });
    const recommendation = result.recommendations.find((item) => item.id === "add-faq");

    assert.ok(recommendation);
    assert.equal(recommendation.title, "No FAQ section detected");
    assert.equal(recommendation.impact, 4);
  });

  it("shows partial FAQ severity for one or two question-style headings", () => {
    const article = articleFixture();
    const oneQuestion = `${article.markdown}\n\n## What should buyers check first?\nThey should check evidence before pricing.`;
    const twoQuestions = `${oneQuestion}\n\n### How should risks be compared?\nThey should be compared against cost and timing.`;

    for (const markdown of [oneQuestion, twoQuestions]) {
      const recommendation = buildSeoDecisionEngine({ article, markdown }).recommendations.find((item) => item.id === "add-faq");
      assert.ok(recommendation);
      assert.equal(recommendation.title, "FAQ coverage could be expanded");
      assert.equal(recommendation.impact, 2);
    }
  });

  it("inserts the most relevant unused statistic into paragraph flow", () => {
    const article = {
      ...articleFixture(),
      markdown: "# Planning Better Projects\n\nA short guide to making sound decisions.\n\n## Risk Reviews\n\nProjects need clear evidence before teams commit budget.\n\n## Ownership\n\nDecision owners keep delivery moving."
    };
    const research = {
      ...researchFixture(),
      usefulFacts: [
        "Teams with named decision owners completed handovers 19% faster.",
        "Projects using early risk reviews reduced delays by 28%.",
        "Clear ownership improves delivery decisions."
      ]
    };
    const result = buildSeoDecisionEngine({ article, markdown: article.markdown, research });
    const recommendation = result.recommendations.find((item) => item.id === "insert-statistics");

    assert.ok(recommendation);
    const updated = recommendation.apply(article.markdown);

    assert.match(updated, /Projects need clear evidence before teams commit budget\. For context, projects using early risk reviews reduced delays by 28%\./);
    assert.doesNotMatch(updated, /^##\s+Key Statistics\b/im);
    assert.doesNotMatch(updated, /^-\s+Projects using early risk reviews reduced delays by 28%\./m);
    assert.ok(!buildSeoDecisionEngine({ article, markdown: updated, research }).recommendations.some((item) => item.id === "insert-statistics" && item.proposedText.includes("28%")));
  });

  it("inserts one unused research finding inline with attribution when available", () => {
    const article = {
      ...articleFixture(),
      markdown: "# Planning Better Projects\n\nA short guide to making sound decisions.\n\n## Ownership\n\nDecision owners keep delivery moving when responsibilities are clear.\n\n## Budget Control\n\nTeams need practical checkpoints before committing spend."
    };
    const research: ResearchPack = {
      ...researchFixture(),
      sources: [
        { id: "source-2", title: "Delivery Institute field guide", url: "https://example.com/delivery", domain: "example.com", highlights: [], authorityScore: 82, relevanceScore: 88, accepted: true }
      ],
      usefulFacts: [
        "Named decision owners make escalation paths easier to follow.",
        "Budget checkpoints help teams pause weak assumptions before costs grow."
      ],
      usefulFactSources: [
        { fact: "Named decision owners make escalation paths easier to follow.", sourceId: "source-2", sourceUrl: "https://example.com/delivery", sourceTitle: "Delivery Institute field guide" }
      ]
    };
    const result = buildSeoDecisionEngine({ article, markdown: article.markdown, research });
    const recommendation = result.recommendations.find((item) => item.id === "insert-findings");

    assert.ok(recommendation);
    const updated = recommendation.apply(article.markdown);

    assert.match(updated, /Decision owners keep delivery moving when responsibilities are clear\. Delivery Institute field guide adds that named decision owners make escalation paths easier to follow\./);
    assert.doesNotMatch(updated, /^##\s+Research Findings\b/im);
    assert.doesNotMatch(updated, /^-\s+Named decision owners make escalation paths easier to follow\./m);
    assert.ok(!buildSeoDecisionEngine({ article, markdown: updated, research }).recommendations.some((item) => item.id === "insert-findings" && item.proposedText.includes("escalation paths")));
  });

  it("inserts a practical example beneath the weakest explanatory section", () => {
    const article = {
      ...articleFixture(),
      title: "Local SEO Strategy",
      markdown: "# Local SEO Strategy\n\nA guide to improving local search performance.\n\n## Keyword Targeting\n\nChoose terms that match the service area.\n\n## Technical Checks\n\nThe site should load quickly, use clean internal links, and avoid confusing duplicate pages. Teams should also check whether important pages can be crawled and indexed before they spend time rewriting content."
    };
    const profile = { ...createDefaultProjectProfile(), industryKey: "seo", industryLabel: "SEO", regionKey: "united_states", regionLabel: "United States" };
    const initial = buildSeoDecisionEngine({ article, markdown: article.markdown, profile });
    const recommendation = initial.recommendations.find((item) => item.id === "add-example");

    assert.ok(recommendation);
    const updated = recommendation.apply(article.markdown);
    const exampleMatch = updated.match(/Example: A local business targeting[\s\S]+?generic ranking checklist\./);

    assert.ok(exampleMatch);
    assert.ok(countWords(exampleMatch[0]) >= 100);
    assert.ok(countWords(exampleMatch[0]) <= 200);
    assert.match(updated, /## Keyword Targeting\n\nChoose terms that match the service area\.\n\nExample: A local business targeting United States searches/);
    assert.doesNotMatch(updated, /^-\s+Example:/m);
    assert.ok(buildSeoDecisionEngine({ article, markdown: updated, profile }).score > initial.score);
  });

  it("inserts inline citations into evidence-heavy sections without source dumps", () => {
    const article = {
      ...articleFixture(),
      markdown: "# Procurement Risk\n\nBuyers need evidence before they commit to a supplier.\n\n## Market Evidence\n\nSupplier capacity should be checked before tender scoring because weak coverage increases delivery risk.\n\n## Compliance\n\nPublic buyers must keep requirements traceable so evaluation decisions can be defended later.\n\n## Team Notes\n\nAgree owners before the next meeting.",
      sources: [
        { id: "source-gartner", title: "Gartner procurement risk report", url: "https://example.com/gartner", domain: "gartner.com", highlights: ["supplier capacity delivery risk"], authorityScore: 88, relevanceScore: 90, accepted: true },
        { id: "source-gov", title: "UK Government procurement guidance", url: "https://gov.uk/procurement", domain: "gov.uk", highlights: ["public buyers traceable requirements evaluation"], authorityScore: 95, relevanceScore: 92, accepted: true },
        { id: "source-oecd", title: "OECD public procurement evidence", url: "https://oecd.org/procurement", domain: "oecd.org", highlights: ["evidence procurement decisions"], authorityScore: 91, relevanceScore: 84, accepted: true }
      ]
    };
    const initial = buildSeoDecisionEngine({ article, markdown: article.markdown });
    const recommendation = initial.recommendations.find((item) => item.id === "cite-sources");

    assert.ok(recommendation);
    const updated = recommendation.apply(article.markdown);
    const citations = updated.match(/\(Source: [^)]+\)/g) ?? [];

    assert.ok(citations.length >= 2);
    assert.ok(citations.length <= 3);
    assert.equal(new Set(citations).size, citations.length);
    assert.match(updated, /Supplier capacity should be checked before tender scoring because weak coverage increases delivery risk\. \(Source: Gartner procurement risk\)/);
    assert.match(updated, /Public buyers must keep requirements traceable so evaluation decisions can be defended later\. \(Source: UK Government procurement\)/);
    assert.doesNotMatch(updated, /^## Sources\b/im);
    assert.ok(!buildSeoDecisionEngine({ article, markdown: updated }).recommendations.some((item) => item.id === "cite-sources"));
  });

  it("appends a deduplicated references section from stored article sources", () => {
    const article = {
      ...articleFixture(),
      markdown: "# Procurement Risk\n\nBuyers need evidence before they commit to a supplier.",
      sources: [
        { id: "source-gov", title: "UK Government Guidance", url: "https://www.gov.uk/example", domain: "gov.uk", highlights: [], authorityScore: 95, relevanceScore: 92, accepted: true },
        { id: "source-gartner", title: "Gartner Research", url: "https://gartner.com/example", domain: "gartner.com", highlights: [], authorityScore: 88, relevanceScore: 90, accepted: true },
        { id: "source-gov-duplicate", title: "Duplicate Government Source", url: "https://www.gov.uk/example", domain: "gov.uk", highlights: [], authorityScore: 80, relevanceScore: 80, accepted: true },
        { id: "source-oecd", title: "OECD Report", url: "https://oecd.org/example?ref=stored", domain: "oecd.org", highlights: [], authorityScore: 91, relevanceScore: 84, accepted: true }
      ]
    };
    const result = buildSeoDecisionEngine({ article, markdown: article.markdown });
    const recommendation = result.recommendations.find((item) => item.id === "insert-citation-list");

    assert.ok(recommendation);
    const updated = recommendation.apply(article.markdown);

    assert.match(updated, /\n\n## References\n\n- UK Government Guidance\n  https:\/\/www\.gov\.uk\/example\n\n- Gartner Research\n  https:\/\/gartner\.com\/example\n\n- OECD Report\n  https:\/\/oecd\.org\/example\?ref=stored\n$/);
    assert.equal((updated.match(/https:\/\/www\.gov\.uk\/example/g) ?? []).length, 1);
    assert.doesNotMatch(updated, /Duplicate Government Source/);
    assert.ok(!buildSeoDecisionEngine({ article, markdown: updated }).recommendations.some((item) => item.id === "insert-citation-list"));
  });

  it("suggests internal links from imported Website Intelligence pages", () => {
    const article = {
      ...articleFixture(),
      sources: [],
      markdown: "# Groundworks Planning\n\nGroundworks shape the programme before excavation and piling begin.\n\n## Delivery Notes\n\nThe team should compare excavation access, piling constraints, and drainage requirements before pricing."
    };
    const result = buildSeoDecisionEngine({
      article,
      markdown: article.markdown,
      sitePages: [
        sitePage("https://mainlinegroundworks.co.uk/services/groundworks", "Groundworks"),
        sitePage("https://mainlinegroundworks.co.uk/services/excavation", "Excavation"),
        sitePage("https://mainlinegroundworks.co.uk/services/piling", "Piling")
      ],
      siteProfile: siteProfile({ services: ["Groundworks", "Excavation", "Piling"] })
    });
    const recommendation = result.recommendations.find((item) => item.id === "suggest-internal-links");

    assert.ok(recommendation);
    assert.equal(recommendation.title, "3 internal linking opportunities detected");
    assert.match(recommendation.proposedText, /Groundworks -> \/services\/groundworks/);
    assert.match(recommendation.proposedText, /excavation -> \/services\/excavation/i);

    const updated = recommendation.apply(article.markdown);
    assert.match(updated, /\[Groundworks\]\(\/services\/groundworks\) shape/);
    assert.match(updated, /\[excavation\]\(\/services\/excavation\) and \[piling\]\(\/services\/piling\)/i);
  });

  it("inserts internal links only into suitable unlinked paragraph occurrences", () => {
    const article = {
      ...articleFixture(),
      sources: [],
      markdown: "# Groundworks\n\n[Groundworks](/existing) are already linked here.\n\n## Excavation\n\nExcavation affects access. Piling affects nearby structures. Drainage affects sequencing.\n\nContact pages and privacy pages should not be suggested."
    };
    const result = buildSeoDecisionEngine({
      article,
      markdown: article.markdown,
      sitePages: [
        sitePage("https://example.com/services/groundworks", "Groundworks"),
        sitePage("https://example.com/services/excavation", "Excavation"),
        sitePage("https://example.com/services/piling", "Piling"),
        sitePage("https://example.com/services/drainage", "Drainage"),
        sitePage("https://example.com/contact", "Contact"),
        sitePage("https://example.com/privacy-policy", "Privacy Policy")
      ],
      siteProfile: siteProfile({ services: ["Groundworks", "Excavation", "Piling", "Drainage"] })
    });
    const recommendation = result.recommendations.find((item) => item.id === "suggest-internal-links");

    assert.ok(recommendation);
    assert.doesNotMatch(recommendation.proposedText, /contact|privacy/i);

    const updated = recommendation.apply(article.markdown);
    assert.match(updated, /^# Groundworks$/m);
    assert.match(updated, /\[Groundworks\]\(\/existing\) are already linked here\./);
    assert.match(updated, /\[Excavation\]\(\/services\/excavation\) affects access/);
    assert.match(updated, /\[Piling\]\(\/services\/piling\) affects nearby structures/);
    assert.match(updated, /\[Drainage\]\(\/services\/drainage\) affects sequencing/);
    assert.doesNotMatch(updated, /\]\(\/contact\)|\]\(\/privacy-policy\)/);
  });

  it("caps internal link insertion at five destinations", () => {
    const article = {
      ...articleFixture(),
      sources: [],
      markdown: "# Services\n\nGroundworks, excavation, piling, drainage, foundations, concrete, remediation, and utilities all need sequencing."
    };
    const services = ["Groundworks", "Excavation", "Piling", "Drainage", "Foundations", "Concrete", "Remediation", "Utilities"];
    const recommendation = buildSeoDecisionEngine({
      article,
      markdown: article.markdown,
      sitePages: services.map((service) => sitePage(`https://example.com/services/${service.toLowerCase()}`, service)),
      siteProfile: siteProfile({ services })
    }).recommendations.find((item) => item.id === "suggest-internal-links");

    assert.ok(recommendation);
    const updated = recommendation.apply(article.markdown);
    assert.equal((updated.match(/\]\(\/services\//g) ?? []).length, 5);
  });

  it("inserts only the reviewed internal links that remain selected", () => {
    const article = {
      ...articleFixture(),
      sources: [],
      markdown: "# Groundworks Planning\n\nGroundworks shape the programme before excavation, piling, and drainage begin."
    };
    const recommendation = buildSeoDecisionEngine({
      article,
      markdown: article.markdown,
      sitePages: [
        sitePage("https://example.com/services/groundworks", "Groundworks"),
        sitePage("https://example.com/services/excavation", "Excavation"),
        sitePage("https://example.com/services/piling", "Piling"),
        sitePage("https://example.com/services/drainage", "Drainage")
      ],
      siteProfile: siteProfile({ services: ["Groundworks", "Excavation", "Piling", "Drainage"] })
    }).recommendations.find((item) => item.id === "suggest-internal-links");

    assert.ok(recommendation);
    const opportunities = (recommendation.metadata?.internalLinkOpportunities ?? []) as Parameters<typeof applySelectedInternalLinks>[1];
    const selected = opportunities.filter((item) => /groundworks|drainage/i.test(item.anchorText));
    const updated = applySelectedInternalLinks(article.markdown, selected);

    assert.match(updated, /\[Groundworks\]\(\/services\/groundworks\) shape/i);
    assert.match(updated, /\[drainage\]\(\/services\/drainage\) begin/i);
    assert.doesNotMatch(updated, /\]\(\/services\/excavation\)/i);
    assert.doesNotMatch(updated, /\]\(\/services\/piling\)/i);
  });

  it("recommends missing graph concepts instead of keyword stuffing", () => {
    const article = articleFixture();
    const research = {
      ...researchFixture(),
      semanticIntelligence: {
        primaryEntity: { label: "Project Risk Management" },
        secondaryEntities: [{ label: "Risk Register" }, { label: "Stakeholder Ownership" }],
        relatedEntities: [{ label: "Delivery Governance" }],
        terminology: [{ label: "RACI" }],
        definitions: [],
        comparisons: [],
        risks: [{ label: "Scope Creep" }],
        benefits: [{ label: "Fewer Delivery Delays" }],
        costs: [{ label: "Budget Contingency" }],
        timeBasedConcepts: [],
        misconceptions: [],
        diagnosticQuestions: [],
        conditionalScenarios: [],
        expectedFaqs: [{ label: "How should teams prioritise project risks?" }],
        entityConfusion: [],
        searchIntentArchetypes: [{ label: "Practical decision support" }],
        missingConcepts: [],
        generatedAt: "2026-06-18T00:00:00.000Z",
        conceptCount: 8
      }
    };

    const result = buildSeoDecisionEngine({ article, markdown: article.markdown, research });
    const recommendation = result.recommendations.find((item) => item.id === "expand-semantic-coverage");

    assert.ok(recommendation);
    assert.match(recommendation.reason, /semantic graph/i);
    assert.match(recommendation.proposedText, /concepts to explain, not keywords to repeat/i);
  });
});

function articleFixture(): ArticleDocument {
  return {
    id: "article-seo",
    projectId: "default",
    jobId: "job-seo",
    title: "Planning Better Projects",
    status: "generated",
    markdown: "# Planning Better Projects\n\nA short guide to making sound decisions.\n\n## Main Issues\n\nProjects need clear evidence.",
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
    wordCount: 12,
    qualityScore: 80,
    researchSummary: "Research complete",
    validation: { pass: true, warnings: [], needsReviewReasons: [], qualityScore: 80, sectionScores: {}, faqScore: 0, seoScore: 70 },
    pipeline: [],
    sources: [{ id: "source-1", title: "Official planning guidance", url: "https://example.gov/guidance", domain: "example.gov", highlights: [], authorityScore: 90, relevanceScore: 90, accepted: true }],
    needsReviewReasons: []
  };
}

function researchFixture(): ResearchPack {
  return {
    articleId: "article-seo",
    title: "Planning Better Projects",
    queries: [],
    sources: [],
    rejectedSources: [],
    usefulFacts: ["Projects using early risk reviews reduced delays by 28%.", "Clear ownership improves delivery decisions."],
    rejectedFacts: [],
    questionsFound: [],
    headingsFound: [],
    authorityScore: 80,
    relevanceScore: 80,
    confidence: 80,
    warnings: [],
    requestIds: [],
    durationMs: 100,
    createdAt: "2026-06-18T00:00:00.000Z"
  };
}

function sitePage(url: string, title: string): SiteKnowledgePageDocument {
  return {
    id: title.toLowerCase().replace(/\s+/g, "-"),
    projectId: "default",
    url,
    title,
    h1: title,
    metaDescription: `${title} service page.`,
    shortSummary: `${title} information for customers.`,
    importedAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
    metadata: {}
  };
}

function siteProfile(patch: Partial<ProjectSiteProfileDocument>): ProjectSiteProfileDocument {
  return {
    projectId: "default",
    domain: "example.com",
    pageCount: 0,
    services: [],
    products: [],
    audiences: [],
    locations: [],
    ctas: [],
    writingSignals: [],
    generatedAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
    metadata: {},
    ...patch
  };
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
