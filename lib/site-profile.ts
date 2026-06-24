import { nowIso } from "@/lib/defaults";
import type { BusinessTypeKey } from "@/lib/project/profile";
import type { ProjectSiteProfileDocument, SiteKnowledgePageDocument } from "@/lib/types";

export interface ExtractSiteProfileInput {
  projectId: string;
  organisationId?: string;
  sitemapUrl?: string;
  pages: SiteKnowledgePageDocument[];
  configuredBusinessType?: BusinessTypeKey;
}

export type SiteProfileBusinessType = "service" | "ecommerce" | "mixed" | "unknown";

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
  "get in touch",
  "shop now",
  "browse collection",
  "browse collections",
  "view range",
  "view collection"
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
const BRAND_STOPWORDS = new Set([
  "home", "about", "contact", "blog", "news", "sale", "shop", "brands", "brand", "collections", "collection",
  "gifts", "gift", "women", "men", "kids", "new in", "new arrivals", "range", "view range", "browse collection"
]);
const SERVICE_URL_HINTS = [/\/services?(?:\/|$)/i, /\/solutions?(?:\/|$)/i, /\/locations?(?:\/|$)/i, /\/areas?(?:\/|$)/i];
const ECOMMERCE_URL_HINTS = [/\/products?(?:\/|$)/i, /\/collections?(?:\/|$)/i, /\/brands?(?:\/|$)/i, /\/shop(?:\/|$)/i, /\/category(?:\/|$)/i];
const SERVICE_TEXT_HINT = /\b(?:services?|contractors?|specialists?|quote|consultation|areas we cover|groundworks|excavation|piling|drainage|underpinning|foundations?)\b/i;
const ECOMMERCE_TEXT_HINT = /\b(?:shop|product|products|collection|collections|brand|brands|gift|gifts|footwear|clothing|fragrance|accessories|add to (?:bag|basket|cart)|wishlist)\b/i;
const ECOMMERCE_CATEGORY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bfragrance\b/i, label: "Fragrance" },
  { pattern: /\bclothing\b|\bapparel\b|\bwomenswear\b|\bmenswear\b/i, label: "Clothing" },
  { pattern: /\bfootwear\b/i, label: "Footwear" },
  { pattern: /\bgifts?\b|\bgiftware\b|\bgift\s+ideas?\b|\bgift\s+guide\b/i, label: "Gifts" },
  { pattern: /\baccessories\b/i, label: "Accessories" },
  { pattern: /\bbeauty\b|\bskincare\b/i, label: "Beauty" },
  { pattern: /\bhomeware\b|\bhome\s+fragrance\b|\bhome\s+accessories\b/i, label: "Homeware" },
  { pattern: /\btoys?\b|\bsoft\s+toys?\b|\bplush\b/i, label: "Toys" },
  { pattern: /\bactivewear\b|\bnightwear\b|\bunderwear\b|\bloungewear\b|\bswimwear\b|\bsleepwear\b/i, label: "Clothing" },
  { pattern: /\bmens?\b|\bwomens?\b|\bmen'?s\b|\bwomen'?s\b|\bgents?\b|\bladies\b/i, label: "Clothing" }
];
const ECOMMERCE_PRODUCT_TYPE_PATTERNS: Array<{ pattern: RegExp; label: string; broader?: string }> = [
  { pattern: /\bperfumes?\b|\bcologne\b/i, label: "Perfume", broader: "Fragrance" },
  { pattern: /\bcandles?\b/i, label: "Candles", broader: "Fragrance" },
  { pattern: /\bdiffusers?\b/i, label: "Diffusers", broader: "Fragrance" },
  { pattern: /\bdresses?\b/i, label: "Dresses", broader: "Clothing" },
  { pattern: /\bjackets?\b|\bcoats?\b/i, label: "Jackets", broader: "Clothing" },
  { pattern: /\bknitwear\b/i, label: "Knitwear", broader: "Clothing" },
  { pattern: /\bboots?\b/i, label: "Boots", broader: "Footwear" },
  { pattern: /\btrainers?\b/i, label: "Trainers", broader: "Footwear" },
  { pattern: /\bsandals?\b/i, label: "Sandals", broader: "Footwear" },
  { pattern: /\bhandbags?\b|\bbags?\b/i, label: "Handbags", broader: "Accessories" },
  { pattern: /\bwallets?\b/i, label: "Wallets", broader: "Accessories" },
  { pattern: /\bscarves?\b/i, label: "Scarves", broader: "Accessories" },
  { pattern: /\bplush\b|\bsoft\s+toys?\b/i, label: "Soft Toys", broader: "Toys" }
];
const ALL_AUDIENCE_TERMS: Array<{ pattern: RegExp; label: string }> = [
  ...AUDIENCE_TERMS,
  { pattern: /\bgift\s+buyers?\b|\bgift\s+shoppers?\b|\bshopping\s+for\s+gifts?\b/i, label: "Gift Buyers" },
  { pattern: /\bwomen'?s\b|\bfor women\b|\bwomenswear\b/i, label: "Women" },
  { pattern: /\bmen'?s\b|\bfor men\b|\bmenswear\b/i, label: "Men" },
  { pattern: /\blifestyle\b|\blifestyle\s+store\b|\blifestyle\s+brand\b/i, label: "Lifestyle Shoppers" }
];

export function extractProjectSiteProfile({ projectId, organisationId, sitemapUrl, pages, configuredBusinessType = "auto_detect" }: ExtractSiteProfileInput): ProjectSiteProfileDocument {
  const generatedAt = nowIso();
  const domain = domainFromUrl(sitemapUrl) || domainFromUrl(pages[0]?.url ?? "");
  const detection = detectBusinessType(pages, configuredBusinessType);
  const services = new Map<string, EntityRecord>();
  const products = new Map<string, EntityRecord>();
  const ecommerceBrands = new Map<string, EntityRecord>();
  const ecommerceCategories = new Map<string, EntityRecord>();
  const ecommerceProductTypes = new Map<string, EntityRecord>();
  const audiences = new Map<string, EntityRecord>();
  const locations = new Map<string, EntityRecord>();
  const ctas = new Map<string, EntityRecord>();
  const writingSignals = new Set<string>();
  const runEcommerceExtraction = detection.businessType === "ecommerce" || detection.businessType === "mixed";
  const ecommerceRejected: Array<{ term: string; reason: string; pageKey: string }> = [];

  for (const page of pages) {
    const text = pageText(page);
    const pageKey = page.url || page.id;
    for (const candidate of candidatePhrases(page)) {
      const service = normalizeService(candidate.value);
      if (service) addEntity(services, service, candidate);

      const category = normalizeProductOrCategory(candidate.value);
      if (category) addEntity(products, category, candidate);

      if (runEcommerceExtraction) {
        const classified = classifyEcommerceEntity(candidate, page);
        if (classified?.type === "brand" && classified.label) addEntity(ecommerceBrands, classified.label, candidate, classified.bonus);
        else if (classified?.type === "category" && classified.label) addEntity(ecommerceCategories, classified.label, candidate, classified.bonus);
        else if (classified?.type === "product_type" && classified.label) addEntity(ecommerceProductTypes, classified.label, candidate, classified.bonus);
        else if (classified?.rejected && ecommerceRejected.length < 120) ecommerceRejected.push({ term: classified.term, reason: classified.rejected, pageKey });
      }
    }
    for (const location of candidateLocations(page)) addEntity(locations, location, { value: location, source: "title", pageKey });
    for (const audience of matchedAudiences(text)) addEntity(audiences, audience, { value: audience, source: "summary", pageKey });
    for (const cta of CTA_TERMS) {
      if (text.includes(cta)) addEntity(ctas, titleCase(cta), { value: cta, source: "summary", pageKey });
    }
    if (/\b(?:colour|favour|labour|specialist|neighbour|mobilisation|programme)\b/i.test(text)) writingSignals.add("UK English");
    if (/\b(?:groundworks|earthworks|excavation|piling|underpinning|foundation|drainage|utilities|demolition|basement)\b/i.test(text)) writingSignals.add("Industry terminology detected");
  }

  if (!ctas.size) addEntity(ctas, detection.businessType === "ecommerce" ? "Shop Now" : "Get A Quote", { value: detection.businessType === "ecommerce" ? "Shop Now" : "Get A Quote", source: "summary", pageKey: domain });
  if (!writingSignals.size && domain.endsWith(".uk")) writingSignals.add("UK English");

  const serviceLabels = rankedLabels(services, 10, 8);
  const legacyProductLabels = rankedCategories(products, serviceLabels, 10, 8);
  const resolvedEcommerce = runEcommerceExtraction
    ? resolveEcommerceFacets(ecommerceBrands, ecommerceCategories, ecommerceProductTypes)
    : { brands: [] as string[], categories: [] as string[], productTypes: [] as string[], debug: null as EcommerceDebugSummary | null };
  const brandLabels = resolvedEcommerce.brands;
  const ecommerceCategoryLabels = resolvedEcommerce.categories;
  const ecommerceProductTypeLabels = resolvedEcommerce.productTypes;
  const ecommerceDebug = mergeEcommerceDebug(resolvedEcommerce.debug, ecommerceRejected);
  const productLabels = uniqueLabels(
    detection.businessType === "service"
      ? legacyProductLabels
      : detection.businessType === "mixed"
        ? [...legacyProductLabels, ...ecommerceCategoryLabels, ...brandLabels, ...ecommerceProductTypeLabels]
        : [...ecommerceCategoryLabels, ...brandLabels, ...ecommerceProductTypeLabels]
  ).slice(0, 10);
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
      extraction: "heuristic_v4",
      businessType: detection.businessType,
      strategyBusinessType: configuredBusinessType,
      strategyBusinessTypeLabel: businessTypeLabel(configuredBusinessType),
      strategySource: configuredBusinessType === "auto_detect" ? "auto_detect" : "project_setting",
      businessTypeSignals: {
        service: detection.serviceSignals,
        ecommerce: detection.ecommerceSignals
      },
      ecommerce: {
        brands: brandLabels,
        categories: ecommerceCategoryLabels,
        productTypes: ecommerceProductTypeLabels,
        debug: ecommerceDebug
      },
      confidence: {
        services: rankedConfidence(services),
        products: rankedConfidence(products),
        audiences: rankedConfidence(audiences),
        locations: rankedConfidence(locations),
        brands: rankedConfidence(ecommerceBrands),
        categories: rankedConfidence(ecommerceCategories),
        productTypes: rankedConfidence(ecommerceProductTypes),
        rejected: ecommerceRejected.slice(0, 60)
      }
    }
  };
}

export function siteProfileContextLines(profile?: ProjectSiteProfileDocument | null) {
  if (!profile) return [];
  const businessType = siteProfileBusinessType(profile);
  const strategyLabel = siteProfileStrategyLabel(profile);
  const ecommerce = siteProfileEcommerceFacets(profile);
  return [
    ["Website", profile.domain],
    ["Business Type", strategyLabel],
    ["Detected Website Type", businessType === "unknown" ? "" : titleCase(businessType)],
    ["Learned Services", profile.services.join(", ")],
    ["Primary Brands", ecommerce.brands.join(", ")],
    ["Primary Categories", ecommerce.categories.join(", ")],
    ["Learned Product Types", ecommerce.productTypes.join(", ")],
    ["Learned Products / Categories", businessType === "service" || businessType === "unknown" ? profile.products.join(", ") : ""],
    ["Learned Audiences", profile.audiences.join(", ")],
    ["Learned Locations", profile.locations.join(", ")],
    ["Suggested CTA", profile.ctas[0] ?? ""],
    ["Writing Preferences", profile.writingSignals.join(", ")]
  ].filter((entry): entry is [string, string] => Boolean(entry[1])).map(([label, value]) => `${label}: ${value}`);
}

export function siteProfilePlanningPriorities(profile?: ProjectSiteProfileDocument | null) {
  if (!profile) return [];
  const businessType = siteProfileBusinessType(profile);
  const ecommerce = siteProfileEcommerceFacets(profile);
  return [
    profile.services.length ? "connect relevant sections to the learned services from the website" : "",
    businessType === "service" || businessType === "unknown"
      ? (profile.products.length ? "use learned product and category language where relevant" : "")
      : "",
    ecommerce.brands.length ? `use learned brand language where relevant: ${ecommerce.brands.slice(0, 3).join(", ")}` : "",
    ecommerce.categories.length ? `use learned category language where relevant: ${ecommerce.categories.slice(0, 3).join(", ")}` : "",
    ecommerce.productTypes.length ? `use learned product-type language where relevant: ${ecommerce.productTypes.slice(0, 3).join(", ")}` : "",
    profile.audiences.length ? `write for ${profile.audiences.slice(0, 3).join(", ")}` : "",
    profile.ctas.length ? `use the suggested CTA when a call to action is appropriate: ${profile.ctas[0]}` : "",
    profile.writingSignals.length ? `follow writing preferences: ${profile.writingSignals.join(", ")}` : ""
  ].filter(Boolean);
}

export function siteProfileBusinessType(profile?: ProjectSiteProfileDocument | null): SiteProfileBusinessType {
  const value = metadataRecord(profile?.metadata).businessType;
  return value === "service" || value === "ecommerce" || value === "mixed" ? value : "unknown";
}

export function siteProfileStrategyKey(profile?: ProjectSiteProfileDocument | null) {
  const metadata = metadataRecord(profile?.metadata);
  const value = metadata.strategyBusinessType;
  return typeof value === "string" ? value : "auto_detect";
}

export function siteProfileStrategyLabel(profile?: ProjectSiteProfileDocument | null) {
  const strategy = siteProfileStrategyKey(profile);
  const detected = siteProfileBusinessType(profile);
  if (strategy === "auto_detect") return detected === "unknown" ? "Auto Detect" : `Auto Detect (${titleCase(detected)})`;
  return businessTypeLabel(strategy);
}

export function siteProfileEcommerceFacets(profile?: ProjectSiteProfileDocument | null) {
  const metadata = metadataRecord(profile?.metadata);
  const ecommerce = metadataRecord(metadata.ecommerce);
  return {
    brands: stringArrayFromUnknown(ecommerce.brands),
    categories: stringArrayFromUnknown(ecommerce.categories),
    productTypes: stringArrayFromUnknown(ecommerce.productTypes)
  };
}

export function siteProfileEcommerceDebug(profile?: ProjectSiteProfileDocument | null) {
  const metadata = metadataRecord(profile?.metadata);
  const ecommerce = metadataRecord(metadata.ecommerce);
  const debug = metadataRecord(ecommerce.debug);
  return Object.keys(debug).length ? debug : null;
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
  for (const audience of ALL_AUDIENCE_TERMS) {
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

function normalizeEcommerceBrandLabel(value: string, candidate: PhraseCandidate, page: SiteKnowledgePageDocument) {
  if (candidate.source === "summary") return null;
  if (!looksLikeBrandPage(page)) return null;
  if (hasCtaContamination(value)) return null;
  const cleaned = cleanEntityLabel(value);
  const focus = ecommercePageFocus(page.url);
  const normalized = stripRetailQualifiers(cleaned);
  if (!isQualityEntity(normalized)) return null;
  if (focus && entityKey(normalized) !== entityKey(stripRetailQualifiers(focus))) return null;
  const lower = normalized.toLowerCase();
  if (BRAND_STOPWORDS.has(lower)) return null;
  if (GENERIC_PRODUCT_TERMS.has(lower)) return null;
  if (normalizeService(normalized)) return null;
  if (normalizeEcommerceCategory(normalized)) return null;
  if (normalizeEcommerceProductType(normalized)) return null;
  if (isRetailTaxonomyTerm(normalized)) return null;
  if (/\b(?:gift|sale|shop|collection|collections|range|browse|view|new in|new arrivals?)\b/i.test(normalized)) return null;
  return normalized;
}

function normalizeEcommerceCategory(value: string) {
  if (hasCtaContamination(value)) return null;
  if (SERVICE_NOISE.test(value)) return null;
  const cleaned = stripRetailQualifiers(cleanEntityLabel(value));
  if (!isQualityEntity(cleaned)) return null;
  if (GENERIC_PRODUCT_TERMS.has(cleaned.toLowerCase())) return null;
  for (const category of ECOMMERCE_CATEGORY_PATTERNS) {
    if (category.pattern.test(cleaned)) return category.label;
  }
  return null;
}

function normalizeEcommerceProductType(value: string) {
  if (hasCtaContamination(value)) return null;
  if (SERVICE_NOISE.test(value)) return null;
  const cleaned = stripRetailQualifiers(cleanEntityLabel(value));
  if (!isQualityEntity(cleaned)) return null;
  if (GENERIC_PRODUCT_TERMS.has(cleaned.toLowerCase())) return null;
  for (const productType of ECOMMERCE_PRODUCT_TYPE_PATTERNS) {
    if (productType.pattern.test(cleaned)) return productType.label;
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

function addEntity(map: Map<string, EntityRecord>, label: string, candidate: PhraseCandidate, scoreBonus = 0) {
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
  current.score += scoreBonus;
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

function rankedRetailProductTypes(map: Map<string, EntityRecord>, categories: string[], limit: number, minimumConfidence: number) {
  const blocked = new Set(categories.map(entityKey));
  return rankedRecords(map)
    .filter((record) => confidence(record) >= minimumConfidence)
    .filter((record) => {
      const key = entityKey(record.label);
      return Boolean(key) && !blocked.has(key);
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

type EcommerceEntityType = "brand" | "category" | "product_type";

interface EcommerceClassification {
  type?: EcommerceEntityType;
  label?: string;
  bonus?: number;
  rejected?: string;
  term: string;
}

interface EcommerceDebugEntry {
  label: string;
  confidence: number;
  pages: number;
}

interface EcommerceDebugSummary {
  detectedBrands: EcommerceDebugEntry[];
  detectedCategories: EcommerceDebugEntry[];
  detectedProductTypes: EcommerceDebugEntry[];
  rejectedTerms: Array<{ term: string; reason: string }>;
}

function mergeEcommerceDebug(debug: EcommerceDebugSummary | null, rejected: Array<{ term: string; reason: string; pageKey: string }>) {
  if (!debug && !rejected.length) return null;
  const base = debug ?? { detectedBrands: [], detectedCategories: [], detectedProductTypes: [], rejectedTerms: [] };
  const combinedRejected = [
    ...base.rejectedTerms,
    ...rejected.slice(0, 40).map((item) => ({ term: item.term, reason: item.reason }))
  ];
  return {
    ...base,
    rejectedTerms: combinedRejected.slice(0, 80)
  };
}

function classifyEcommerceEntity(candidate: PhraseCandidate, page: SiteKnowledgePageDocument): EcommerceClassification | null {
  const cleaned = stripRetailQualifiers(cleanEntityLabel(candidate.value));
  if (!isQualityEntity(cleaned)) return null;
  if (GENERIC_PRODUCT_TERMS.has(cleaned.toLowerCase())) return null;
  if (hasCtaContamination(cleaned)) return null;

  const retailCategory = normalizeEcommerceCategory(cleaned);
  if (retailCategory) {
    return {
      type: "category",
      label: retailCategory,
      bonus: ecommerceEntityBonus("category", page.url, candidate.source),
      term: cleaned
    };
  }

  const productType = normalizeEcommerceProductType(cleaned);
  if (productType) {
    return {
      type: "product_type",
      label: productType,
      bonus: ecommerceEntityBonus("product_type", page.url, candidate.source),
      term: cleaned
    };
  }

  const brand = normalizeEcommerceBrandLabel(cleaned, candidate, page);
  if (brand) {
    return {
      type: "brand",
      label: brand,
      bonus: ecommerceEntityBonus("brand", page.url, candidate.source) + (looksLikeBrandPage(page) ? 4 : 0),
      term: cleaned
    };
  }

  if (looksLikeBrandPage(page) && candidate.source !== "summary") {
    const focus = ecommercePageFocus(page.url);
    if (focus && isRetailTaxonomyTerm(focus)) return { term: cleaned, rejected: "retail_taxonomy_in_brand_context" };
    if (focus && normalizeEcommerceCategory(focus)) return { term: cleaned, rejected: "category_like_brand_focus" };
    return { term: cleaned, rejected: "not_classified" };
  }

  return null;
}

function ecommerceEntityBonus(type: EcommerceEntityType, url: string, source: EntitySource) {
  const page = ecommercePageKind(url);
  const base = page === "homepage"
    ? 10
    : page === "about"
      ? 8
      : page === "brand"
        ? 8
        : page === "collection"
          ? 6
          : page === "product"
            ? 3
            : page === "blog"
              ? 0
              : 4;

  const typeWeight = type === "brand" ? 2 : type === "category" ? 1 : 1;
  const sourceWeight = source === "url" || source === "title" || source === "h1" ? 2 : 0;
  return base + typeWeight + sourceWeight;
}

function ecommercePageKind(url: string) {
  const lower = url.toLowerCase();
  if (lower.endsWith("/") || /\/$/.test(lower)) {
    try {
      if (new URL(url).pathname === "/") return "homepage" as const;
    } catch {
      return "other" as const;
    }
  }
  if (/\b(?:about|about-us|our-story|story|who-we-are|store-information|store-info)\b/i.test(lower)) return "about" as const;
  if (/\/brands?\b/i.test(lower) || /\/collections?\/[^/]+$/.test(lower) && /\/collections?\/(?:brand|brands)\b/i.test(lower)) return "brand" as const;
  if (/\/brands?\//i.test(lower)) return "brand" as const;
  if (/\/collections?\//i.test(lower)) return "collection" as const;
  if (/\/products?\//i.test(lower)) return "product" as const;
  if (/\/(?:blog|news|articles)\b/i.test(lower)) return "blog" as const;
  return "other" as const;
}

function resolveEcommerceFacets(
  brands: Map<string, EntityRecord>,
  categories: Map<string, EntityRecord>,
  productTypes: Map<string, EntityRecord>
) {
  const brandThreshold = 16;
  const categoryThreshold = 14;
  const productTypeThreshold = 14;
  const comparisonFloor = 8;
  const registry = new Map<string, { brand?: EntityRecord; category?: EntityRecord; productType?: EntityRecord }>();
  const rejected: Array<{ term: string; reason: string }> = [];

  for (const record of brands.values()) {
    if (confidence(record) < comparisonFloor) continue;
    registry.set(entityKey(record.label), { ...(registry.get(entityKey(record.label)) ?? {}), brand: record });
  }
  for (const record of categories.values()) {
    if (confidence(record) < comparisonFloor) continue;
    registry.set(entityKey(record.label), { ...(registry.get(entityKey(record.label)) ?? {}), category: record });
  }
  for (const record of productTypes.values()) {
    if (confidence(record) < comparisonFloor) continue;
    registry.set(entityKey(record.label), { ...(registry.get(entityKey(record.label)) ?? {}), productType: record });
  }

  const resolved: Array<{ type: EcommerceEntityType; record: EntityRecord }> = [];
  for (const entry of registry.values()) {
    const brandScore = entry.brand ? confidence(entry.brand) : -1;
    const categoryScore = entry.category ? confidence(entry.category) : -1;
    const productTypeScore = entry.productType ? confidence(entry.productType) : -1;

    const winner = resolveEcommerceWinner({ brandScore, categoryScore, productTypeScore });
    if (winner === "brand" && entry.brand && brandScore >= brandThreshold) resolved.push({ type: "brand", record: entry.brand });
    else if (winner === "category" && entry.category && categoryScore >= categoryThreshold) resolved.push({ type: "category", record: entry.category });
    else if (winner === "product_type" && entry.productType && productTypeScore >= productTypeThreshold) resolved.push({ type: "product_type", record: entry.productType });
    else {
      const label = entry.brand?.label ?? entry.category?.label ?? entry.productType?.label ?? "";
      if (label) rejected.push({ term: label, reason: "below_threshold_or_suppressed" });
    }
  }

  const brandsResolved = resolved.filter((item) => item.type === "brand").sort((a, b) => confidence(b.record) - confidence(a.record)).slice(0, 10);
  const categoriesResolved = resolved.filter((item) => item.type === "category").sort((a, b) => confidence(b.record) - confidence(a.record)).slice(0, 10);
  const productTypesResolved = resolved.filter((item) => item.type === "product_type").sort((a, b) => confidence(b.record) - confidence(a.record)).slice(0, 10);

  return {
    brands: brandsResolved.map((item) => item.record.label),
    categories: categoriesResolved.map((item) => item.record.label),
    productTypes: productTypesResolved.map((item) => item.record.label),
    debug: {
      detectedBrands: rankedRecords(brands).slice(0, 25).map((record) => ({ label: record.label, confidence: confidence(record), pages: record.pages.size })),
      detectedCategories: rankedRecords(categories).slice(0, 25).map((record) => ({ label: record.label, confidence: confidence(record), pages: record.pages.size })),
      detectedProductTypes: rankedRecords(productTypes).slice(0, 25).map((record) => ({ label: record.label, confidence: confidence(record), pages: record.pages.size })),
      rejectedTerms: rejected.slice(0, 60)
    } satisfies EcommerceDebugSummary
  };
}

function resolveEcommerceWinner(scores: { brandScore: number; categoryScore: number; productTypeScore: number }): EcommerceEntityType {
  const { brandScore, categoryScore, productTypeScore } = scores;
  if (productTypeScore >= 0 && productTypeScore >= brandScore + 3 && productTypeScore >= categoryScore + 2) return "product_type";
  if (brandScore >= 0 && brandScore >= categoryScore + 3 && brandScore >= productTypeScore + 2) return "brand";
  if (categoryScore >= 0 && categoryScore >= productTypeScore + 2 && categoryScore >= brandScore) return "category";
  if (brandScore >= categoryScore && brandScore >= productTypeScore) return "brand";
  if (productTypeScore >= categoryScore) return "product_type";
  return "category";
}

function stripRetailQualifiers(value: string) {
  return value
    .replace(/\b(?:men'?s|mens|women'?s|womens|ladies|gents)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isRetailTaxonomyTerm(value: string) {
  const lower = value.toLowerCase();
  if (!lower) return false;
  if (/\b(?:mens?|women'?s|womens?|ladies|gents)\b/.test(lower)) return true;
  if (/\b(?:activewear|nightwear|underwear|loungewear|swimwear|sleepwear)\b/.test(lower)) return true;
  if (/\b(?:clothing|footwear|accessories|gifts|beauty|homeware|toys)\b/.test(lower)) return true;
  if (/\b(?:new in|new arrivals|sale|offers|clearance)\b/.test(lower)) return true;
  return false;
}

function detectBusinessType(pages: SiteKnowledgePageDocument[], configuredBusinessType: BusinessTypeKey) {
  let serviceSignals = 0;
  let ecommerceSignals = 0;

  for (const page of pages) {
    const url = page.url.toLowerCase();
    const text = pageText(page);
    if (SERVICE_URL_HINTS.some((pattern) => pattern.test(url))) serviceSignals += 4;
    if (ECOMMERCE_URL_HINTS.some((pattern) => pattern.test(url))) ecommerceSignals += 4;
    if (SERVICE_TEXT_HINT.test(text) || SERVICE_PATTERNS.some((service) => service.pattern.test(text))) serviceSignals += 2;
    if (ECOMMERCE_TEXT_HINT.test(text) || ECOMMERCE_CATEGORY_PATTERNS.some((category) => category.pattern.test(text))) ecommerceSignals += 2;
  }

  const forced = configuredBusinessTypeToSiteProfileType(configuredBusinessType);
  if (forced) {
    return { businessType: forced, serviceSignals, ecommerceSignals };
  }

  let businessType: SiteProfileBusinessType = "unknown";
  if (serviceSignals >= 6 && ecommerceSignals >= 6) businessType = "mixed";
  else if (ecommerceSignals >= 6 && ecommerceSignals >= serviceSignals + 2) businessType = "ecommerce";
  else if (serviceSignals >= 4 && serviceSignals >= ecommerceSignals + 2) businessType = "service";
  else if (serviceSignals >= 4 && ecommerceSignals >= 4) businessType = "mixed";
  else if (ecommerceSignals > 0 && serviceSignals > 0) businessType = "mixed";
  else if (ecommerceSignals > 0) businessType = "ecommerce";
  else if (serviceSignals > 0) businessType = "service";

  return { businessType, serviceSignals, ecommerceSignals };
}

function configuredBusinessTypeToSiteProfileType(value: BusinessTypeKey) {
  if (value === "auto_detect") return null;
  if (value === "ecommerce") return "ecommerce" as const;
  return "service" as const;
}

function businessTypeLabel(value: string) {
  if (value === "ecommerce") return "Ecommerce";
  if (value === "service_business") return "Service Business";
  if (value === "local_service") return "Local Service";
  if (value === "agency") return "Agency";
  if (value === "saas") return "SaaS";
  if (value === "charity") return "Charity";
  return "Auto Detect";
}

function looksLikeBrandPage(page: SiteKnowledgePageDocument) {
  const url = page.url.toLowerCase();
  if (/\/brands?(?:\/|$)/i.test(url)) return true;
  if (!/\/collections?(?:\/|$)/i.test(url)) return false;
  const focus = ecommercePageFocus(page.url);
  if (!focus) return false;
  return !normalizeEcommerceCategory(focus) && !normalizeEcommerceProductType(focus);
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

function ecommercePageFocus(value: string) {
  const segments = urlPathSegments(value).map((segment) => segment.toLowerCase());
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!["collections", "collection", "brands", "brand", "products", "product", "shop"].includes(segment)) continue;
    const focus = segments[index + 1];
    if (!focus) continue;
    const cleaned = cleanEntityLabel(focus);
    if (cleaned && !GENERIC_PRODUCT_TERMS.has(cleaned.toLowerCase())) return cleaned;
  }
  return null;
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

function uniqueLabels(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = entityKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArrayFromUnknown(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
