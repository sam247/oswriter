import { nowIso } from "@/lib/defaults";
import type { ProjectSiteProfileDocument, SiteKnowledgePageDocument } from "@/lib/types";

export interface ExtractSiteProfileInput {
  projectId: string;
  organisationId?: string;
  sitemapUrl?: string;
  pages: SiteKnowledgePageDocument[];
}

type EntitySource = "url" | "title" | "h1" | "meta" | "summary";

interface PhraseCandidate {
  value: string;
  source: EntitySource;
  pageKey: string;
}

interface EntityRecord {
  label: string;
  score: number;
  pages: Set<string>;
  urlHits: number;
  titleHits: number;
  h1Hits: number;
  raw: Set<string>;
}

const SERVICE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bcfa\s+piling\b/i, label: "CFA Piling" },
  { pattern: /\bmini\s+piling\b/i, label: "Mini Piling" },
  { pattern: /\bcommercial\s+groundworks\b/i, label: "Commercial Groundworks" },
  { pattern: /\bcommercial\s+drainage\b/i, label: "Commercial Drainage" },
  { pattern: /\bbasement\s+excavation\b/i, label: "Basement Excavation" },
  { pattern: /\bfoundation\s+repair\b/i, label: "Foundation Repair" },
  { pattern: /\bretaining\s+walls?\b/i, label: "Retaining Walls" },
  { pattern: /\bsite\s+clearance\b/i, label: "Site Clearance" },
  { pattern: /\butility\s+diversions?\b/i, label: "Utility Diversions" },
  { pattern: /\bgroundworks\b/i, label: "Groundworks" },
  { pattern: /\bearthworks\b/i, label: "Earthworks" },
  { pattern: /\bexcavation\b/i, label: "Excavation" },
  { pattern: /\bpiling\b/i, label: "Piling" },
  { pattern: /\bunderpinning\b/i, label: "Underpinning" },
  { pattern: /\bfoundations?\b/i, label: "Foundations" },
  { pattern: /\bdrainage\b/i, label: "Drainage" },
  { pattern: /\bdemolition\b/i, label: "Demolition" },
  { pattern: /\bconcrete\b/i, label: "Concrete" },
  { pattern: /\bremediation\b/i, label: "Remediation" }
];

const AUDIENCE_TERMS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bproperty\s+developers?\b/i, label: "Property Developers" },
  { pattern: /\bdevelopers?\b/i, label: "Property Developers" },
  { pattern: /\bmain\s+contractors?\b/i, label: "Main Contractors" },
  { pattern: /\bhouse\s+builders?\b/i, label: "House Builders" },
  { pattern: /\bquantity\s+surveyors?\b/i, label: "Quantity Surveyors" },
  { pattern: /\bprocurement\s+teams?\b/i, label: "Procurement Teams" },
  { pattern: /\bcommercial\s+clients?\b/i, label: "Commercial Clients" },
  { pattern: /\blocal\s+authorities\b/i, label: "Local Authorities" },
  { pattern: /\barchitects?\b/i, label: "Architects" },
  { pattern: /\bcontractors?\b/i, label: "Contractors" },
  { pattern: /\bhomeowners?\b/i, label: "Homeowners" },
  { pattern: /\blandlords?\b/i, label: "Landlords" }
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

const CTA_CONTAMINATION = /\b(?:get|request|quote|call|contact|enquire|enquiry|fast\s+response|speak\s+to|book|today|now)\b/i;
const SERVICE_NOISE = /\b(?:contact|quote|response|call|home|blog|page|author|category|tag)\b/i;
const BAD_ENTITY_CHARS = /[<>]|&[a-z#0-9]+;|[{}[\]\\]|(?:[!?.,;:]){2,}/i;
const SERVICE_LABELS = new Set(SERVICE_PATTERNS.map((service) => service.label.toLowerCase()));
const UK_PLACE_ALLOWLIST = new Set([
  "london", "putney", "chelsea", "hammersmith", "fulham", "kensington", "chiswick", "kingston",
  "surrey", "kent", "west midlands", "wimbledon", "ealing", "richmond", "battersea", "clapham",
  "islington", "camden", "croydon", "hackney", "bromley", "barnet", "brent", "greenwich",
  "hounslow", "lambeth", "southwark", "wandsworth", "westminster"
]);
const LOCATION_STOPWORDS = new Set(["services", "service", "contractors", "contractor", "company", "local", "trusted", "groundworks", "commercial", "page", "home"]);
const GENERIC_PRODUCT_TERMS = new Set(["home", "about", "contact", "blog", "news", "services", "areas", "projects", "privacy", "terms"]);

export function extractProjectSiteProfile({ projectId, organisationId, sitemapUrl, pages }: ExtractSiteProfileInput): ProjectSiteProfileDocument {
  const generatedAt = nowIso();
  const domain = domainFromUrl(sitemapUrl) || domainFromUrl(pages[0]?.url ?? "");
  const services = new Map<string, EntityRecord>();
  const products = new Map<string, EntityRecord>();
  const audiences = new Map<string, EntityRecord>();
  const locations = new Map<string, EntityRecord>();
  const ctas = new Map<string, EntityRecord>();
  const writingSignals = new Set<string>();

  for (const page of pages) {
    const text = pageText(page);
    const pageKey = page.url || page.id;
    for (const candidate of candidatePhrases(page)) {
      const service = normalizeService(candidate.value);
      if (service) addEntity(services, service, candidate);

      const category = normalizeProductOrCategory(candidate.value);
      if (category) addEntity(products, category, candidate);
    }
    for (const location of candidateLocations(page)) addEntity(locations, location, { value: location, source: "title", pageKey });
    for (const audience of matchedAudiences(text)) addEntity(audiences, audience, { value: audience, source: "summary", pageKey });
    for (const cta of CTA_TERMS) {
      if (text.includes(cta)) addEntity(ctas, titleCase(cta), { value: cta, source: "summary", pageKey });
    }
    if (/\b(?:colour|favour|labour|specialist|neighbour|mobilisation|programme)\b/i.test(text)) writingSignals.add("UK English");
    if (/\b(?:groundworks|earthworks|excavation|piling|underpinning|foundation|drainage|utilities|demolition|basement)\b/i.test(text)) writingSignals.add("Industry terminology detected");
  }

  if (!ctas.size) addEntity(ctas, "Get A Quote", { value: "Get A Quote", source: "summary", pageKey: domain });
  if (!writingSignals.size && domain.endsWith(".uk")) writingSignals.add("UK English");

  const serviceLabels = rankedLabels(services, 10, 8);
  const productLabels = rankedCategories(products, serviceLabels, 10, 8);
  const audienceLabels = rankedLabels(audiences, 8, 2);
  const locationLabels = rankedLocations(locations, 15, 4, new Set([...serviceLabels, ...productLabels]));

  return {
    projectId,
    ...(organisationId ? { organisationId } : {}),
    domain,
    pageCount: pages.length,
    services: serviceLabels,
    products: productLabels,
    audiences: audienceLabels,
    locations: locationLabels,
    ctas: rankedLabels(ctas, 4, 1),
    writingSignals: [...writingSignals].slice(0, 8),
    generatedAt,
    updatedAt: generatedAt,
    metadata: {
      extraction: "heuristic_v2",
      confidence: {
        services: rankedConfidence(services),
        products: rankedConfidence(products),
        audiences: rankedConfidence(audiences),
        locations: rankedConfidence(locations)
      }
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

function candidatePhrases(page: SiteKnowledgePageDocument): PhraseCandidate[] {
  const pageKey = page.url || page.id;
  const candidates: PhraseCandidate[] = [];
  for (const value of urlPathSegments(page.url)) candidates.push({ value, source: "url", pageKey });
  for (const value of splitUsefulPhrases(page.title)) candidates.push({ value, source: "title", pageKey });
  for (const value of splitUsefulPhrases(page.h1)) candidates.push({ value, source: "h1", pageKey });
  for (const value of splitUsefulPhrases(page.metaDescription)) candidates.push({ value, source: "meta", pageKey });
  for (const value of splitUsefulPhrases(page.shortSummary)) candidates.push({ value, source: "summary", pageKey });
  return candidates;
}

function candidateLocations(page: SiteKnowledgePageDocument) {
  const urlLabels = urlPathSegments(page.url)
    .map(cleanEntityLabel)
    .map(normalizeLocation)
    .filter((segment): segment is string => Boolean(segment));
  const titleMatches = [...`${page.title} ${page.h1}`.matchAll(/\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g)]
    .map((match) => normalizeLocation(match[1]))
    .filter((value): value is string => Boolean(value));
  return [...urlLabels, ...titleMatches];
}

function matchedAudiences(text: string) {
  const found = new Set<string>();
  for (const audience of AUDIENCE_TERMS) {
    if (audience.pattern.test(text)) found.add(audience.label);
  }
  return [...found];
}

function normalizeService(value: string) {
  if (hasCtaContamination(value)) return null;
  if (SERVICE_NOISE.test(value)) return null;
  const cleaned = cleanEntityLabel(value);
  if (!isQualityEntity(cleaned)) return null;
  for (const service of SERVICE_PATTERNS) {
    if (service.pattern.test(cleaned)) return service.label;
  }
  return null;
}

function normalizeProductOrCategory(value: string) {
  if (hasCtaContamination(value)) return null;
  if (SERVICE_NOISE.test(value)) return null;
  const cleaned = cleanEntityLabel(value);
  if (!isQualityEntity(cleaned)) return null;
  if (GENERIC_PRODUCT_TERMS.has(cleaned.toLowerCase())) return null;
  for (const service of SERVICE_PATTERNS) {
    if (service.pattern.test(cleaned)) return service.label;
  }
  return null;
}

function normalizeLocation(value: string) {
  const cleaned = cleanEntityLabel(value)
    .replace(/\b(?:Greater|UK|United Kingdom)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!isQualityEntity(cleaned)) return null;
  if (LOCATION_STOPWORDS.has(cleaned.toLowerCase())) return null;
  if (isServiceLabel(cleaned)) return null;
  if (!isRecognisedLocation(cleaned)) return null;
  if (!/^[A-Z][a-z]+(?: [A-Z][a-z]+)?$/.test(cleaned)) return null;
  return cleaned;
}

function cleanEntityLabel(value: string) {
  return titleCase(decodeHtml(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\b(?:trusted|local|company|services?|contractors?|specialists?)\b/gi, " ")
    .replace(/\b(?:in|near|for)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g, " ")
    .replace(/[!?.,;:<>]+$/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function isQualityEntity(value: string) {
  if (value.length < 3 || value.split(/\s+/).length > 5) return false;
  if (BAD_ENTITY_CHARS.test(value)) return false;
  if (/[^\p{L}\p{N}\s/&-]/u.test(value)) return false;
  return true;
}

function hasCtaContamination(value: string) {
  return CTA_CONTAMINATION.test(value);
}

function addEntity(map: Map<string, EntityRecord>, label: string, candidate: PhraseCandidate) {
  if (!isQualityEntity(label)) return;
  const key = entityKey(label);
  if (!key) return;
  const current = map.get(key) ?? {
    label,
    score: 0,
    pages: new Set<string>(),
    urlHits: 0,
    titleHits: 0,
    h1Hits: 0,
    raw: new Set<string>()
  };
  current.label = cleanestLabel(current.label, label);
  current.score += sourceScore(candidate.source);
  if (!current.pages.has(candidate.pageKey)) current.score += 2;
  current.pages.add(candidate.pageKey);
  if (candidate.source === "url") current.urlHits += 1;
  if (candidate.source === "title") current.titleHits += 1;
  if (candidate.source === "h1") current.h1Hits += 1;
  current.raw.add(candidate.value);
  map.set(key, current);
}

function rankedLabels(map: Map<string, EntityRecord>, limit: number, minimumConfidence: number) {
  return rankedRecords(map)
    .filter((record) => confidence(record) >= minimumConfidence)
    .slice(0, limit)
    .map((record) => record.label);
}

function rankedCategories(map: Map<string, EntityRecord>, services: string[], limit: number, minimumConfidence: number) {
  const serviceSet = new Set(services.map(entityKey));
  return rankedRecords(map)
    .filter((record) => confidence(record) >= minimumConfidence)
    .filter((record) => {
      const key = entityKey(record.label);
      if (!key) return false;
      const broader = broaderCategory(record.label);
      if (!broader) return true;
      const broaderKey = entityKey(broader);
      return !broaderKey || !serviceSet.has(broaderKey);
    })
    .slice(0, limit)
    .map((record) => record.label);
}

function rankedLocations(map: Map<string, EntityRecord>, limit: number, minimumConfidence: number, blockedLabels: Set<string>) {
  const blocked = new Set([...blockedLabels].map(entityKey));
  const deduped = new Map<string, EntityRecord>();
  for (const record of rankedRecords(map)) {
    const key = locationKey(record.label);
    if (!key || blocked.has(entityKey(record.label)) || isServiceLabel(record.label)) continue;
    const existing = deduped.get(key);
    if (!existing || record.label.length < existing.label.length || confidence(record) > confidence(existing)) deduped.set(key, record);
  }
  return [...deduped.values()]
    .filter((record) => confidence(record) >= minimumConfidence)
    .sort((left, right) => confidence(right) - confidence(left) || left.label.localeCompare(right.label))
    .slice(0, limit)
    .map((record) => record.label);
}

function rankedConfidence(map: Map<string, EntityRecord>) {
  return rankedRecords(map).slice(0, 20).map((record) => ({
    label: record.label,
    score: confidence(record),
    pages: record.pages.size,
    urlHits: record.urlHits,
    titleHits: record.titleHits,
    h1Hits: record.h1Hits
  }));
}

function rankedRecords(map: Map<string, EntityRecord>) {
  return [...map.values()].sort((left, right) => confidence(right) - confidence(left) || wordCount(left.label) - wordCount(right.label) || left.label.localeCompare(right.label));
}

function confidence(record: EntityRecord) {
  return record.score + record.pages.size * 2 + record.urlHits * 3 + record.titleHits * 2 + record.h1Hits * 2;
}

function isServiceLabel(value: string) {
  const key = entityKey(value);
  return SERVICE_LABELS.has(key) || SERVICE_PATTERNS.some((service) => service.pattern.test(value));
}

function isRecognisedLocation(value: string) {
  const key = locationKey(value);
  if (UK_PLACE_ALLOWLIST.has(key)) return true;
  if (/\b(?:london|surrey|kent|yorkshire|midlands|essex|sussex|hertfordshire|hampshire|berkshire|buckinghamshire|oxfordshire|cambridgeshire)\b/i.test(value)) return true;
  return false;
}

function broaderCategory(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("groundworks") && normalized !== "groundworks") return "Groundworks";
  if (normalized.includes("drainage") && normalized !== "drainage") return "Drainage";
  if (normalized.includes("piling") && normalized !== "piling" && normalized !== "cfa piling" && normalized !== "mini piling") return "Piling";
  if (normalized.includes("foundation") && normalized !== "foundations") return "Foundations";
  return null;
}

function cleanestLabel(left: string, right: string) {
  const leftWords = wordCount(left);
  const rightWords = wordCount(right);
  if (rightWords < leftWords) return right;
  if (rightWords === leftWords && right.length < left.length) return right;
  return left;
}

function entityKey(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s/&-]/gu, " ").replace(/\s+/g, " ").trim();
}

function locationKey(value: string) {
  return value.toLowerCase().replace(/\b(?:greater|uk|united kingdom)\b/g, "").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

function sourceScore(source: EntitySource) {
  if (source === "url") return 5;
  if (source === "title") return 4;
  if (source === "h1") return 4;
  if (source === "meta") return 2;
  return 1;
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
    .filter((item) => item.length >= 3 && item.length <= 100);
}

function wordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase()).replace(/\bUk\b/g, "UK").replace(/\bCfa\b/g, "CFA");
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function domainFromUrl(value = "") {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
