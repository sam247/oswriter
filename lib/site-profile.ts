import { nowIso } from "@/lib/defaults";
import type { ProjectSiteProfileDocument, SiteKnowledgePageDocument } from "@/lib/types";

export interface ExtractSiteProfileInput {
  projectId: string;
  organisationId?: string;
  sitemapUrl?: string;
  pages: SiteKnowledgePageDocument[];
}

const SERVICE_SUFFIXES = [
  "contractors",
  "contractor",
  "services",
  "service",
  "company",
  "specialists",
  "specialist"
];

const AUDIENCE_TERMS = [
  "property developers",
  "developers",
  "main contractors",
  "contractors",
  "house builders",
  "homeowners",
  "landlords",
  "architects",
  "quantity surveyors",
  "procurement teams",
  "commercial clients",
  "local authorities"
];

const CTA_TERMS = [
  "get a quote",
  "request a quote",
  "book a consultation",
  "contact us",
  "call us",
  "enquire today",
  "get in touch"
];

const LOCATION_STOPWORDS = new Set(["services", "service", "contractors", "contractor", "company", "local", "trusted", "groundworks"]);
const GENERIC_PRODUCT_TERMS = new Set(["home", "about", "contact", "blog", "news", "services", "areas", "projects", "privacy", "terms"]);

export function extractProjectSiteProfile({ projectId, organisationId, sitemapUrl, pages }: ExtractSiteProfileInput): ProjectSiteProfileDocument {
  const generatedAt = nowIso();
  const domain = domainFromUrl(sitemapUrl) || domainFromUrl(pages[0]?.url ?? "");
  const serviceCounts = new Map<string, number>();
  const productCounts = new Map<string, number>();
  const audienceCounts = new Map<string, number>();
  const locationCounts = new Map<string, number>();
  const ctaCounts = new Map<string, number>();
  const writingSignals = new Set<string>();

  for (const page of pages) {
    const text = pageText(page);
    for (const phrase of candidatePhrases(page)) {
      if (looksLikeService(phrase)) increment(serviceCounts, cleanLabel(phrase));
      if (looksLikeProductOrCategory(phrase)) increment(productCounts, cleanLabel(phrase));
    }
    for (const location of candidateLocations(page)) increment(locationCounts, location);
    for (const audience of AUDIENCE_TERMS) {
      if (text.includes(audience)) increment(audienceCounts, titleCase(audience));
    }
    for (const cta of CTA_TERMS) {
      if (text.includes(cta)) increment(ctaCounts, titleCase(cta));
    }
    if (/\b(?:colour|favour|labour|specialist|neighbour|mobilisation|programme)\b/i.test(text)) writingSignals.add("UK English");
    if (/\b(?:groundworks|earthworks|excavation|piling|underpinning|foundation|drainage|utilities|demolition|basement)\b/i.test(text)) writingSignals.add("Industry terminology detected");
  }

  if (!ctaCounts.size) ctaCounts.set("Get A Quote", 1);
  if (!writingSignals.size && domain.endsWith(".uk")) writingSignals.add("UK English");

  return {
    projectId,
    ...(organisationId ? { organisationId } : {}),
    domain,
    pageCount: pages.length,
    services: topLabels(serviceCounts, 16),
    products: topLabels(productCounts, 12),
    audiences: topLabels(audienceCounts, 8),
    locations: topLabels(locationCounts, 16),
    ctas: topLabels(ctaCounts, 4),
    writingSignals: [...writingSignals].slice(0, 8),
    generatedAt,
    updatedAt: generatedAt,
    metadata: {
      extraction: "heuristic_v1"
    }
  };
}

export function siteProfileContextLines(profile?: ProjectSiteProfileDocument | null) {
  if (!profile) return [];
  return [
    ["Website", profile.domain],
    ["Learned Services", profile.services.join(", ")],
    ["Learned Products / Categories", profile.products.join(", ")],
    ["Learned Audiences", profile.audiences.join(", ")],
    ["Learned Locations", profile.locations.join(", ")],
    ["Suggested CTA", profile.ctas[0] ?? ""],
    ["Writing Preferences", profile.writingSignals.join(", ")]
  ].filter((entry): entry is [string, string] => Boolean(entry[1])).map(([label, value]) => `${label}: ${value}`);
}

export function siteProfilePlanningPriorities(profile?: ProjectSiteProfileDocument | null) {
  if (!profile) return [];
  return [
    profile.services.length ? "connect relevant sections to the learned services from the website" : "",
    profile.products.length ? "use learned product and category language where relevant" : "",
    profile.audiences.length ? `write for ${profile.audiences.slice(0, 3).join(", ")}` : "",
    profile.ctas.length ? `use the suggested CTA when a call to action is appropriate: ${profile.ctas[0]}` : "",
    profile.writingSignals.length ? `follow writing preferences: ${profile.writingSignals.join(", ")}` : ""
  ].filter(Boolean);
}

function pageText(page: SiteKnowledgePageDocument) {
  return `${page.url} ${page.title} ${page.h1} ${page.metaDescription} ${page.shortSummary}`.toLowerCase();
}

function candidatePhrases(page: SiteKnowledgePageDocument) {
  const chunks = [
    ...urlPathSegments(page.url),
    page.title,
    page.h1,
    page.metaDescription
  ];
  return chunks.flatMap(splitUsefulPhrases).filter(Boolean);
}

function candidateLocations(page: SiteKnowledgePageDocument) {
  const segments = urlPathSegments(page.url);
  const labels = segments
    .map((segment) => cleanLabel(segment))
    .filter((segment) => segment && !LOCATION_STOPWORDS.has(segment.toLowerCase()))
    .filter((segment) => /^[A-Z][a-z]+(?: [A-Z][a-z]+)?$/.test(segment));
  const titleMatches = [...`${page.title} ${page.h1}`.matchAll(/\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g)].map((match) => match[1]);
  return [...labels, ...titleMatches].filter((value): value is string => Boolean(value));
}

function urlPathSegments(value: string) {
  try {
    return new URL(value).pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment).replace(/[-_]+/g, " "));
  } catch {
    return [];
  }
}

function splitUsefulPhrases(value: string) {
  return value
    .split(/\s*(?:\||,|:|–|-{2,}|\/)\s*/g)
    .map((item) => item.replace(/\b(?:in|near|for)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g, "").trim())
    .filter((item) => item.length >= 4 && item.length <= 80);
}

function looksLikeService(value: string) {
  const normalized = value.toLowerCase();
  return /\b(?:groundworks|earthworks|excavation|piling|underpinning|foundation|drainage|demolition|utilities|basement|site clearance|concrete|remediation)\b/.test(normalized)
    || SERVICE_SUFFIXES.some((suffix) => normalized.endsWith(` ${suffix}`));
}

function looksLikeProductOrCategory(value: string) {
  const normalized = value.toLowerCase();
  if (GENERIC_PRODUCT_TERMS.has(normalized)) return false;
  return /\b(?:foundations?|piling|underpinning|basements?|drainage|earthworks|excavation|groundworks|concrete|retaining walls?|cfa piling|mini piling)\b/.test(normalized);
}

function cleanLabel(value: string) {
  return titleCase(value
    .replace(/\b(?:trusted|local|company|services?|contractors?|specialists?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim());
}

function topLabels(counts: Map<string, number>, limit: number) {
  return [...counts.entries()]
    .filter(([label]) => label.length > 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([label]) => label);
}

function increment(map: Map<string, number>, value: string) {
  if (!value) return;
  map.set(value, (map.get(value) ?? 0) + 1);
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase()).replace(/\bUk\b/g, "UK");
}

function domainFromUrl(value = "") {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
