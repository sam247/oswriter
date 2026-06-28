import { nowIso } from "@/lib/defaults";
import type {
  BusinessKnowledgeGraph,
  KnowledgeCoverageResult,
  KnowledgeGraphItem,
  ProjectSiteProfileDocument,
  ResearchPack,
  SemanticKnowledgeGraph,
  SiteKnowledgePageDocument
} from "@/lib/types";

type BusinessCategory = keyof Omit<BusinessKnowledgeGraph, "generatedAt" | "sourcePageCount">;
type SemanticCategory = keyof Omit<SemanticKnowledgeGraph, "primaryEntity" | "generatedAt" | "conceptCount">;

const TRUST_PATTERNS: Array<[RegExp, string]> = [
  [/\biso\s?9001\b/i, "ISO 9001"],
  [/\biso\s?14001\b/i, "ISO 14001"],
  [/\bcertified\b/i, "Certifications"],
  [/\baccredited\b/i, "Accreditations"],
  [/\baward(?:ed|s)?\b/i, "Awards"],
  [/\btrustpilot\b/i, "Trustpilot"],
  [/\bgoogle reviews?\b/i, "Google Reviews"],
  [/\bcase stud(?:y|ies)\b/i, "Case studies"],
  [/\btestimonial(?:s)?\b/i, "Testimonials"]
];

const ASSET_PATTERNS: Array<[RegExp, string]> = [
  [/\bguide(?:s)?\b/i, "Guides"],
  [/\bwhite\s?paper(?:s)?\b/i, "Whitepapers"],
  [/\bcalculator(?:s)?\b/i, "Calculators"],
  [/\bvideo(?:s)?\b/i, "Videos"],
  [/\bfaq(?:s)?\b|frequently asked/i, "FAQs"],
  [/\bpricing\b|\bplans\b/i, "Pricing pages"],
  [/\bdocumentation\b|\bdocs\b/i, "Documentation"]
];

const BENEFIT_TERMS = /\b(?:benefit|advantage|improve|reduce|save|faster|easier|increase|stronger|better|protect|enable)\b/i;
const RISK_TERMS = /\b(?:risk|challenge|problem|mistake|avoid|failure|limitation|danger|issue|concern)\b/i;
const COST_TERMS = /\b(?:cost|price|pricing|budget|roi|fee|expensive|cheap|investment|spend)\b/i;
const TIME_TERMS = /\b(?:year|month|week|day|timeline|deadline|season|current|future|history|trend|annual|quarter)\b/i;
const COMPARISON_TERMS = /\b(?:vs\.?|versus|compare|comparison|alternative|difference|better than|which)\b/i;
const DEFINITION_TERMS = /\b(?:what is|definition|means|refers to|is a|are a)\b/i;
const MISCONCEPTION_TERMS = /\b(?:myth|misconception|mistaken|confuse|confusion|not the same|assume)\b/i;
const CONDITIONAL_TERMS = /\b(?:if|when|unless|depends|scenario|case by case|for businesses|for teams)\b/i;

export function buildBusinessKnowledgeGraph(profile: ProjectSiteProfileDocument, pages: SiteKnowledgePageDocument[]): BusinessKnowledgeGraph {
  const graph: BusinessKnowledgeGraph = {
    authority: [],
    trust: [],
    expertise: [],
    assets: [],
    brand: [],
    internalLinks: [],
    generatedAt: nowIso(),
    sourcePageCount: pages.length
  };

  for (const service of profile.services) addBusinessItem(graph, "expertise", service, "Learned service");
  for (const product of profile.products) addBusinessItem(graph, "expertise", product, "Learned product or category");
  for (const audience of profile.audiences) addBusinessItem(graph, "brand", audience, "Learned audience");
  for (const location of profile.locations) addBusinessItem(graph, "authority", location, "Learned location");
  for (const cta of profile.ctas) addBusinessItem(graph, "brand", cta, "Preferred CTA");
  for (const signal of profile.writingSignals) addBusinessItem(graph, "brand", signal, "Writing signal");

  for (const page of pages) {
    const text = pageText(page);
    for (const match of text.matchAll(/\b(\d{1,3})\+?\s+(?:years?|yrs?)\s+(?:of\s+)?(?:experience|trading|in business)\b/gi)) {
      addBusinessItem(graph, "authority", `${match[1]} years experience`, page.url);
    }
    for (const match of text.matchAll(/\b(\d{2,3}(?:,\d{3})?|\d+(?:\.\d+)?k)\+?\s+(?:customers|clients|projects|installations|users)\b/gi)) {
      addBusinessItem(graph, "authority", match[0], page.url);
    }
    for (const [pattern, label] of TRUST_PATTERNS) {
      if (pattern.test(text)) addBusinessItem(graph, "trust", label, page.url);
    }
    for (const [pattern, label] of ASSET_PATTERNS) {
      if (pattern.test(text)) addBusinessItem(graph, "assets", label, page.url);
    }
    if (isUsefulInternalLinkPage(page)) addBusinessItem(graph, "internalLinks", page.h1 || page.title, page.url, { url: page.url });
  }

  return graph;
}

export function buildSemanticKnowledgeGraph(title: string, research: Pick<ResearchPack, "researchConcepts" | "usefulFacts" | "questionsFound" | "headingsFound">): SemanticKnowledgeGraph {
  const concepts = uniqueLabels([title, ...(research.researchConcepts ?? [])]).slice(0, 36);
  const facts = research.usefulFacts ?? [];
  const headings = research.headingsFound ?? [];
  const questions = research.questionsFound ?? [];
  const graph: SemanticKnowledgeGraph = {
    primaryEntity: { label: cleanLabel(title), evidence: ["Article title"], confidence: 1 },
    secondaryEntities: concepts.slice(1, 8).map((label) => semanticItem(label, "Research concept")),
    relatedEntities: concepts.slice(8, 18).map((label) => semanticItem(label, "Related research concept")),
    terminology: concepts.filter((label) => /\b[A-Z]{2,}\b|[-/]/.test(label)).slice(0, 8).map((label) => semanticItem(label, "Technical terminology")),
    definitions: semanticItemsFromText([...facts, ...headings], DEFINITION_TERMS, "Definition signal", 8),
    comparisons: semanticItemsFromText([...facts, ...headings], COMPARISON_TERMS, "Comparison signal", 8),
    risks: semanticItemsFromText(facts, RISK_TERMS, "Risk signal", 8),
    benefits: semanticItemsFromText(facts, BENEFIT_TERMS, "Benefit signal", 8),
    costs: semanticItemsFromText(facts, COST_TERMS, "Cost signal", 6),
    timeBasedConcepts: semanticItemsFromText(facts, TIME_TERMS, "Time-based signal", 6),
    misconceptions: semanticItemsFromText([...facts, ...headings], MISCONCEPTION_TERMS, "Misconception signal", 5),
    diagnosticQuestions: questions.slice(0, 8).map((label) => semanticItem(label, "Question found in research")),
    conditionalScenarios: semanticItemsFromText(facts, CONDITIONAL_TERMS, "Conditional scenario", 6),
    expectedFaqs: questions.slice(0, 6).map((label) => semanticItem(label, "Expected FAQ")),
    entityConfusion: semanticItemsFromText([...facts, ...headings], MISCONCEPTION_TERMS, "Entity confusion signal", 5),
    searchIntentArchetypes: inferIntentArchetypes(title, questions, headings),
    missingConcepts: inferMissingConcepts(title, concepts, facts),
    generatedAt: nowIso(),
    conceptCount: concepts.length
  };

  if (!graph.terminology.length) graph.terminology = concepts.slice(0, 6).map((label) => semanticItem(label, "Topic terminology"));
  if (!graph.expectedFaqs.length) graph.expectedFaqs = defaultFaqsForTitle(title);
  return graph;
}

export function businessGraphContextLines(graph?: BusinessKnowledgeGraph | null) {
  if (!graph) return [];
  return [
    graph.authority.length ? `Authority: ${labels(graph.authority, 8).join(", ")}` : "",
    graph.trust.length ? `Trust: ${labels(graph.trust, 8).join(", ")}` : "",
    graph.expertise.length ? `Expertise: ${labels(graph.expertise, 10).join(", ")}` : "",
    graph.assets.length ? `Assets: ${labels(graph.assets, 8).join(", ")}` : "",
    graph.brand.length ? `Brand: ${labels(graph.brand, 8).join(", ")}` : "",
    graph.internalLinks.length ? `Internal link candidates: ${labels(graph.internalLinks, 8).join(", ")}` : ""
  ].filter(Boolean);
}

export function semanticGraphContextLines(graph?: SemanticKnowledgeGraph | null) {
  if (!graph) return [];
  return [
    graph.primaryEntity?.label ? `Primary entity: ${graph.primaryEntity.label}` : "",
    graph.secondaryEntities.length ? `Secondary entities: ${labels(graph.secondaryEntities, 8).join(", ")}` : "",
    graph.relatedEntities.length ? `Related entities: ${labels(graph.relatedEntities, 8).join(", ")}` : "",
    graph.terminology.length ? `Terminology: ${labels(graph.terminology, 8).join(", ")}` : "",
    graph.definitions.length ? `Definitions to cover: ${labels(graph.definitions, 5).join(", ")}` : "",
    graph.comparisons.length ? `Comparisons: ${labels(graph.comparisons, 5).join(", ")}` : "",
    graph.risks.length ? `Risks: ${labels(graph.risks, 5).join(", ")}` : "",
    graph.benefits.length ? `Benefits: ${labels(graph.benefits, 5).join(", ")}` : "",
    graph.costs.length ? `Costs: ${labels(graph.costs, 5).join(", ")}` : "",
    graph.expectedFaqs.length ? `Expected FAQs: ${labels(graph.expectedFaqs, 5).join(", ")}` : ""
  ].filter(Boolean);
}

export function graphPlanningPriorities(business?: BusinessKnowledgeGraph | null, semantic?: SemanticKnowledgeGraph | null) {
  return [
    business?.authority.length ? "include business authority signals only where they naturally support reader trust" : "",
    business?.trust.length ? "use trust evidence when it strengthens claims, comparisons, or next-step advice" : "",
    business?.assets.length ? "consider internal assets and link opportunities before generic next steps" : "",
    semantic?.secondaryEntities.length ? "cover the expected semantic entities and terminology without keyword stuffing" : "",
    semantic?.risks.length ? "address material risks and misconceptions where the topic calls for them" : "",
    semantic?.expectedFaqs.length ? "answer likely follow-up questions from the semantic graph" : ""
  ].filter(Boolean);
}

export function calculateKnowledgeCoverage(markdown: string, items: KnowledgeGraphItem[], label: string): KnowledgeCoverageResult {
  const available = labels(items, 20);
  const used = available.filter((item) => conceptCovered(markdown, item));
  const missing = available.filter((item) => !used.includes(item));
  return {
    available,
    used,
    missing,
    opportunities: missing.slice(0, 4).map((item) => `${label}: ${item}`)
  };
}

export function semanticCoverageItems(graph?: SemanticKnowledgeGraph | null) {
  if (!graph) return [];
  return uniqueItems([
    ...(graph.primaryEntity ? [graph.primaryEntity] : []),
    ...graph.secondaryEntities,
    ...graph.relatedEntities,
    ...graph.terminology,
    ...graph.definitions,
    ...graph.comparisons,
    ...graph.risks,
    ...graph.benefits,
    ...graph.costs,
    ...graph.expectedFaqs
  ]).slice(0, 40);
}

export function businessCoverageItems(graph?: BusinessKnowledgeGraph | null) {
  if (!graph) return [];
  return uniqueItems([...graph.authority, ...graph.trust, ...graph.expertise, ...graph.assets, ...graph.brand]).slice(0, 40);
}

function addBusinessItem(graph: BusinessKnowledgeGraph, category: BusinessCategory, label: string, evidence: string, metadata?: Record<string, unknown>) {
  const clean = cleanLabel(label);
  if (!clean) return;
  const existing = graph[category].find((item) => item.label.toLowerCase() === clean.toLowerCase());
  if (existing) {
    existing.evidence = [...new Set([...(existing.evidence ?? []), evidence])].slice(0, 5);
    return;
  }
  graph[category].push({ label: clean, evidence: [evidence], confidence: 0.8, ...(metadata ? { metadata } : {}) });
}

function semanticItemsFromText(values: string[], pattern: RegExp, evidence: string, limit: number) {
  return uniqueLabels(values.filter((value) => pattern.test(value)).map(extractConceptPhrase)).slice(0, limit).map((label) => semanticItem(label, evidence));
}

function semanticItem(label: string, evidence: string): KnowledgeGraphItem {
  return { label: cleanLabel(label), evidence: [evidence], confidence: 0.75 };
}

function inferIntentArchetypes(title: string, questions: string[], headings: string[]) {
  const text = `${title} ${questions.join(" ")} ${headings.join(" ")}`.toLowerCase();
  const intents: KnowledgeGraphItem[] = [];
  if (/\bhow\b|\bguide\b|\bsteps?\b/.test(text)) intents.push(semanticItem("How-to guidance", "Intent signal"));
  if (/\bwhat\b|\bdefinition\b|\bmeaning\b/.test(text)) intents.push(semanticItem("Definition and explanation", "Intent signal"));
  if (/\bbest\b|\btop\b|\bcompare\b|\bvs\b/.test(text)) intents.push(semanticItem("Evaluation and comparison", "Intent signal"));
  if (/\bcost\b|\bprice\b|\bpricing\b/.test(text)) intents.push(semanticItem("Cost evaluation", "Intent signal"));
  if (!intents.length) intents.push(semanticItem("Practical decision support", "Default intent"));
  return intents;
}

function inferMissingConcepts(title: string, concepts: string[], facts: string[]) {
  const text = `${title} ${concepts.join(" ")} ${facts.join(" ")}`;
  const missing: KnowledgeGraphItem[] = [];
  if (!DEFINITION_TERMS.test(text)) missing.push(semanticItem("Clear definition", "Completeness heuristic"));
  if (!RISK_TERMS.test(text)) missing.push(semanticItem("Risks and common mistakes", "Completeness heuristic"));
  if (!BENEFIT_TERMS.test(text)) missing.push(semanticItem("Benefits and outcomes", "Completeness heuristic"));
  if (!CONDITIONAL_TERMS.test(text)) missing.push(semanticItem("When this applies", "Completeness heuristic"));
  return missing;
}

function defaultFaqsForTitle(title: string) {
  const topic = cleanLabel(title);
  return [
    semanticItem(`What is ${topic}?`, "Default expected FAQ"),
    semanticItem(`When does ${topic} matter?`, "Default expected FAQ"),
    semanticItem(`What should readers check before acting on ${topic}?`, "Default expected FAQ")
  ];
}

function isUsefulInternalLinkPage(page: SiteKnowledgePageDocument) {
  return /\/(?:services?|products?|collections?|pricing|guides?|resources|case-stud(?:y|ies)|faq|docs?)(?:\/|$)/i.test(page.url);
}

function pageText(page: SiteKnowledgePageDocument) {
  return `${page.url} ${page.title} ${page.h1} ${page.metaDescription} ${page.shortSummary}`;
}

function extractConceptPhrase(value: string) {
  const sentence = value.split(/[.;:!?]/)[0] ?? value;
  return sentence.replace(/^\s*(?:what is|definition of|benefits of|risks of|costs of)\s+/i, "").slice(0, 90);
}

function uniqueLabels(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.map(cleanLabel).filter(Boolean)) {
    const key = normalize(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function uniqueItems(items: KnowledgeGraphItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalize(item.label);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function labels(items: KnowledgeGraphItem[], limit: number) {
  return uniqueItems(items).map((item) => item.label).slice(0, limit);
}

function conceptCovered(markdown: string, concept: string) {
  const text = normalize(markdown);
  const key = normalize(concept);
  if (!key) return false;
  if (text.includes(key)) return true;
  const tokens = key.split(" ").filter((token) => token.length > 3);
  return tokens.length > 1 && tokens.every((token) => text.includes(token));
}

function cleanLabel(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[^a-z0-9]+|[^a-z0-9?)+]+$/gi, "").trim();
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
