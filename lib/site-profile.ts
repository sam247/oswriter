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

export interface SiteEntityRecommendations {
  brands: string[];
  categories: string[];
  productTypes: string[];
  audiences: string[];
  cta: string | null;
  brandUsageTarget?: { min: number; max: number };
  priorityLines: string[];
  contextLines: string[];
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
  "book a demo",
  "book demo",
  "request a demo",
  "request demo",
  "contact us",
  "call us",
  "enquire today",
  "get in touch",
  "get started",
  "start trial",
  "start free trial",
  "talk to sales",
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
  { pattern: /\bhome\s+fragrance\b/i, label: "Home Fragrance", broader: "Fragrance" },
  { pattern: /\bgift\s+sets?\b/i, label: "Gift Sets", broader: "Gifts" },
  { pattern: /\bdresses?\b/i, label: "Dresses", broader: "Clothing" },
  { pattern: /\bjackets?\b|\bcoats?\b/i, label: "Jackets", broader: "Clothing" },
  { pattern: /\bknitwear\b/i, label: "Knitwear", broader: "Clothing" },
  { pattern: /\bboots?\b/i, label: "Boots", broader: "Footwear" },
  { pattern: /\btrainers?\b/i, label: "Trainers", broader: "Footwear" },
  { pattern: /\bsandals?\b/i, label: "Sandals", broader: "Footwear" },
  { pattern: /\bwellies\b|\bwellington\s+boots?\b/i, label: "Wellies", broader: "Footwear" },
  { pattern: /\bslippers?\b/i, label: "Slippers", broader: "Footwear" },
  { pattern: /\bhandbags?\b|\bbags?\b/i, label: "Handbags", broader: "Accessories" },
  { pattern: /\bbelts?\b/i, label: "Belts", broader: "Accessories" },
  { pattern: /\bwallets?\b/i, label: "Wallets", broader: "Accessories" },
  { pattern: /\bscarves?\b/i, label: "Scarves", broader: "Accessories" },
  { pattern: /\bhats?\s*&\s*gloves\b|\bhats?\s+gloves\b/i, label: "Hats & Gloves", broader: "Accessories" },
  { pattern: /\bsocks?\s*&\s*tights\b|\bsocks?\s+tights\b/i, label: "Socks & Tights", broader: "Accessories" },
  { pattern: /\beye\s+masks?\b/i, label: "Eye Masks", broader: "Accessories" },
  { pattern: /\bshirts?\s*&\s*tops\b|\bshirts?\s+tops\b|\btops?\b/i, label: "Tops", broader: "Clothing" },
  { pattern: /\btrousers?\s*&\s*shorts\b|\btrousers?\s+shorts\b/i, label: "Trousers & Shorts", broader: "Clothing" },
  { pattern: /\bplush\b|\bsoft\s+toys?\b/i, label: "Soft Toys", broader: "Toys" }
];
const BRAND_RELATION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bfragrance\b|\bperfumes?\b|\bcologne\b|\bscents?\b/i, label: "Fragrance" },
  { pattern: /\bdiffusers?\b/i, label: "Diffusers" },
  { pattern: /\bcandles?\b/i, label: "Candles" },
  { pattern: /\bhome\s+fragrance\b/i, label: "Home Fragrance" },
  { pattern: /\bgift\s+sets?\b/i, label: "Gift Sets" },
  { pattern: /\bgifts?\b|\bpresents?\b/i, label: "Gifts" },
  { pattern: /\bclothing\b|\bapparel\b|\bwomenswear\b|\bmenswear\b/i, label: "Clothing" },
  { pattern: /\bouterwear\b|\bjackets?\b|\bcoats?\b/i, label: "Outerwear" },
  { pattern: /\bknitwear\b/i, label: "Knitwear" },
  { pattern: /\bfootwear\b|\bboots?\b|\btrainers?\b|\bsandals?\b|\bwellies\b|\bslippers?\b/i, label: "Footwear" },
  { pattern: /\baccessories\b|\bhandbags?\b|\bbelts?\b|\bscarves?\b|\bhats?\b|\bgloves\b|\bwallets?\b|\beye\s+masks?\b/i, label: "Accessories" },
  { pattern: /\bbeauty\b|\bskincare\b/i, label: "Beauty" },
  { pattern: /\bhomeware\b|\bhome\s+accessories\b/i, label: "Homeware" }
];
const TITLE_TOPIC_PATTERNS: Array<{ pattern: RegExp; topic: string }> = [
  { pattern: /\bfragrance\b|\bperfumes?\b|\bcologne\b|\bscent\b|\bscents\b/i, topic: "Fragrance" },
  { pattern: /\bdiffusers?\b/i, topic: "Diffusers" },
  { pattern: /\bcandles?\b/i, topic: "Candles" },
  { pattern: /\bhome\s+fragrance\b/i, topic: "Home Fragrance" },
  { pattern: /\bgift\s+sets?\b/i, topic: "Gift Sets" },
  { pattern: /\bgifts?\b|\bpresents?\b/i, topic: "Gifts" },
  { pattern: /\bwear\b|\bstyle\b|\boutfit\b|\bfashion\b|\bclothing\b/i, topic: "Clothing" },
  { pattern: /\bknitwear\b/i, topic: "Knitwear" },
  { pattern: /\bfootwear\b|\bboots?\b|\btrainers?\b|\bsandals?\b|\bwellies\b|\bslippers?\b/i, topic: "Footwear" },
  { pattern: /\baccessories\b|\bhandbags?\b|\bscarves?\b|\bbelts?\b/i, topic: "Accessories" },
  { pattern: /\bbeauty\b|\bskincare\b/i, topic: "Beauty" },
  { pattern: /\bhomeware\b|\bhome\b|\binterior\b/i, topic: "Homeware" }
];
const ALL_AUDIENCE_TERMS: Array<{ pattern: RegExp; label: string }> = [
  ...AUDIENCE_TERMS,
  { pattern: /\bcompliance\s+teams?\b/i, label: "Compliance Teams" },
  { pattern: /\blegal\s+operations\b/i, label: "Legal Operations" },
  { pattern: /\blegal\s+teams?\b/i, label: "Legal Teams" },
  { pattern: /\bgovernance\s+teams?\b/i, label: "Governance Teams" },
  { pattern: /\boperations\s+teams?\b/i, label: "Operations Teams" },
  { pattern: /\bfinance\s+teams?\b/i, label: "Finance Teams" },
  { pattern: /\bsecurity\s+teams?\b/i, label: "Security Teams" },
  { pattern: /\bit\s+teams?\b/i, label: "IT Teams" },
  { pattern: /\bhr\s+teams?\b|\bhuman\s+resources\b/i, label: "HR Teams" },
  { pattern: /\bprocurement\s+teams?\b/i, label: "Procurement Teams" },
  { pattern: /\bsales\s+teams?\b/i, label: "Sales Teams" },
  { pattern: /\bmarketing\s+teams?\b/i, label: "Marketing Teams" },
  { pattern: /\bsupport\s+teams?\b|\bcustomer\s+support\b/i, label: "Support Teams" },
  { pattern: /\bregulated\s+business(?:es)?\b/i, label: "Regulated Businesses" },
  { pattern: /\benterprises?\b|\benterprise\s+teams?\b/i, label: "Enterprise Teams" },
  { pattern: /\bsmall\s+business(?:es)?\b|\bsmbs?\b/i, label: "Small Businesses" },
  { pattern: /\bstartups?\b/i, label: "Startups" },
  { pattern: /\bsaas\b/i, label: "SaaS Teams" },
  { pattern: /\bagencies?\b/i, label: "Agencies" },
  { pattern: /\bretailers?\b/i, label: "Retailers" },
  { pattern: /\bmanufacturers?\b/i, label: "Manufacturers" },
  { pattern: /\bgift\s+buyers?\b|\bgift\s+shoppers?\b|\bshopping\s+for\s+gifts?\b/i, label: "Gift Buyers" },
  { pattern: /\bwomen'?s\b|\bfor women\b|\bwomenswear\b/i, label: "Women" },
  { pattern: /\bmen'?s\b|\bfor men\b|\bmenswear\b/i, label: "Men" },
  { pattern: /\blifestyle\b|\blifestyle\s+store\b|\blifestyle\s+brand\b/i, label: "Lifestyle Shoppers" }
];
const DISCOVERY_SERVICE_SECTION_HINT = /\/(?:services?|solutions?|features?|platform|capabilities|use-cases?|workflows?)\//i;
const DISCOVERY_GENERIC_PAGES = new Set([
  "about", "about us", "contact", "pricing", "plans", "blog", "resources", "articles", "news", "home", "homepage",
  "demo", "book demo", "book a demo", "request demo", "request a demo", "contact us", "get started"
]);
const DISCOVERY_TRAILING_SERVICE_TERMS = /\b(?:services?|software|platform|solutions?|features?|capabilities|tools?|systems?|apps?)\b/gi;

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
    if (isSearchDiscoveryPage(page)) {
      for (const candidate of discoveryServiceCandidates(page)) addEntity(services, candidate.value, candidate, discoveryServiceBonus(candidate.source));
    }
    for (const location of candidateLocations(page)) addEntity(locations, location, { value: location, source: "title", pageKey });
    for (const audience of matchedAudiences(text)) addEntity(audiences, audience, { value: audience, source: "summary", pageKey });
    for (const cta of CTA_TERMS) {
      if (text.includes(cta)) addEntity(ctas, normalizeCtaLabel(cta), { value: cta, source: "summary", pageKey });
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
    : { brands: [] as string[], categories: [] as string[], productTypes: [] as string[], brandRecords: [] as EntityRecord[], debug: null as EcommerceDebugSummary | null };
  const brandLabels = resolvedEcommerce.brands;
  const ecommerceCategoryLabels = resolvedEcommerce.categories;
  const ecommerceProductTypeLabels = resolvedEcommerce.productTypes;
  const brandRelationshipDiagnostics: Record<string, BrandRelationshipDebugEntry> = runEcommerceExtraction
    ? buildBrandRelationshipDiagnostics(resolvedEcommerce.brandRecords, pages)
    : {};
  const ecommerceDebug = mergeEcommerceDebug(resolvedEcommerce.debug, ecommerceRejected, brandRelationshipDiagnostics);
  const brandRelationships = Object.fromEntries(
    Object.entries(brandRelationshipDiagnostics)
      .map(([key, value]) => [key, value.associatedCategories] as const)
      .filter((entry) => entry[1].length)
  );
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
      extraction: "heuristic_v5",
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
        brandRelationships,
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
    productTypes: stringArrayFromUnknown(ecommerce.productTypes),
    brandRelationships: stringRecordArray(ecommerce.brandRelationships)
  };
}

export function siteProfileEcommerceDebug(profile?: ProjectSiteProfileDocument | null) {
  const metadata = metadataRecord(profile?.metadata);
  const ecommerce = metadataRecord(metadata.ecommerce);
  const debug = metadataRecord(ecommerce.debug);
  return Object.keys(debug).length ? debug : null;
}

export function siteProfileEntityRecommendations(profile: ProjectSiteProfileDocument | null | undefined, title: string): SiteEntityRecommendations | null {
  if (!profile) return null;
  const businessType = siteProfileBusinessType(profile);
  const ecommerce = siteProfileEcommerceFacets(profile);
  const titleContext = normalizeRecommendationText(title);
  const brands = rankedEntitySubset(ecommerce.brands, titleContext, 5, "brand", ecommerce.brandRelationships);
  const categories = rankedEntitySubset(ecommerce.categories, titleContext, 3, "category");
  const productTypes = rankedEntitySubset(ecommerce.productTypes, titleContext, 4, "product_type");
  const services = rankedEntitySubset(profile.services, titleContext, 4, "service");
  const products = rankedEntitySubset(profile.products, titleContext, 4, "product_type");
  const audiences = rankedEntitySubset(profile.audiences, titleContext, 3, "audience");
  const chosenCategories = businessType === "service" || businessType === "unknown" ? [] : categories;
  const chosenProductTypes = businessType === "service" ? products : productTypes;
  const chosenBrands = businessType === "service" ? [] : brands;
  const chosenServices = businessType === "ecommerce" ? [] : services;
  const cta = profile.ctas[0] ?? null;
  const brandUsageTarget = chosenBrands.length ? { min: 2, max: 5 } : undefined;
  const priorityLines = [
    chosenBrands.length ? `prefer website-owned brands before external brands when relevant: ${chosenBrands.join(", ")}` : "",
    chosenBrands.length ? `when the topic supports practical product examples, weave ${brandUsageTarget?.min}-${brandUsageTarget?.max} natural mentions of relevant website-owned brands into recommendations instead of keeping them generic` : "",
    chosenBrands.length ? "use brand references inside advice, outfit suggestions, gifting ideas, or product examples rather than listing brands artificially" : "",
    chosenBrands.length ? "do not force brand mentions where there is no natural fit, and do not let the article read like promotional copy" : "",
    chosenCategories.length ? `prefer website categories before generic retail examples: ${chosenCategories.join(", ")}` : "",
    chosenProductTypes.length ? `prefer website product types when giving examples or recommendations: ${chosenProductTypes.join(", ")}` : "",
    chosenServices.length ? `prefer the website's own services when giving examples or recommendations: ${chosenServices.join(", ")}` : "",
    audiences.length ? `prefer website audiences when describing readers, shoppers, or use cases: ${audiences.join(", ")}` : "",
    cta ? `use the website CTA in the conclusion when appropriate: ${cta}` : "",
    (chosenBrands.length || chosenCategories.length || chosenProductTypes.length || chosenServices.length)
      ? "only introduce external brands, retailers, or product examples when no relevant website-owned entity exists or the research specifically requires them"
      : ""
  ].filter(Boolean);
  const contextLines = [
    chosenBrands.length ? `Recommended website brands for this article: ${chosenBrands.join(", ")}` : "",
    chosenBrands.length ? `Brand usage target for this article: ${brandUsageTarget?.min}-${brandUsageTarget?.max} natural mentions when contextually relevant` : "",
    chosenBrands.length ? `Natural brand-example pattern: weave brands into advice like "a waterproof jacket from brands such as ${chosenBrands.slice(0, 2).join(" or ")}"` : "",
    chosenCategories.length ? `Recommended website categories for this article: ${chosenCategories.join(", ")}` : "",
    chosenProductTypes.length ? `Recommended website product types for this article: ${chosenProductTypes.join(", ")}` : "",
    chosenServices.length ? `Recommended website services for this article: ${chosenServices.join(", ")}` : "",
    audiences.length ? `Recommended website audiences for this article: ${audiences.join(", ")}` : "",
    cta ? `Preferred website CTA for this article: ${cta}` : ""
  ].filter(Boolean);
  if (!priorityLines.length && !contextLines.length) return null;
  return { brands: chosenBrands, categories: chosenCategories, productTypes: chosenProductTypes, audiences, cta, brandUsageTarget, priorityLines, contextLines };
}

function pageText(page: SiteKnowledgePageDocument) {
  return `${page.url} ${page.title} ${page.h1} ${page.metaDescription} ${page.shortSummary}`.toLowerCase();
}

function isSearchDiscoveryPage(page: SiteKnowledgePageDocument) {
  return metadataRecord(page.metadata).source === "search_discovery";
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

function discoveryServiceCandidates(page: SiteKnowledgePageDocument) {
  const pageKey = page.url || page.id;
  const candidates: PhraseCandidate[] = [];
  const seen = new Set<string>();
  const pushCandidate = (value: string | null, source: EntitySource) => {
    if (!value) return;
    const key = entityKey(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push({ value, source, pageKey });
  };

  pushCandidate(discoveryServiceLabelFromUrl(page.url), "url");
  if (DISCOVERY_SERVICE_SECTION_HINT.test(page.url)) {
    pushCandidate(normalizeDiscoveryServiceLabel(page.h1), "h1");
    pushCandidate(normalizeDiscoveryServiceLabel(page.title), "title");
  }
  pushCandidate(discoveryServiceLabelFromPhrase(page.title), "title");
  pushCandidate(discoveryServiceLabelFromPhrase(page.h1), "h1");
  pushCandidate(discoveryServiceLabelFromPhrase(page.metaDescription), "summary");
  pushCandidate(discoveryServiceLabelFromPhrase(page.shortSummary), "summary");

  return candidates;
}

function discoveryServiceLabelFromUrl(url: string) {
  const segments = urlPathSegments(url);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]?.toLowerCase();
    if (!segment) continue;
    if (!["service", "services", "solution", "solutions", "feature", "features", "platform", "capabilities", "use case", "use cases", "workflow", "workflows"].includes(segment)) continue;
    return normalizeDiscoveryServiceLabel(segments[index + 1] ?? "");
  }
  return null;
}

function discoveryServiceLabelFromPhrase(value: string) {
  const cleaned = decodeHtml(value).replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const matched = cleaned.match(/^(.{3,80}?)\s+(?:services?|software|platform|solutions?|features?|capabilities|tools?|systems?|apps?)\b/i);
  if (!matched) return null;
  return normalizeDiscoveryServiceLabel(matched[1] ?? "");
}

function normalizeDiscoveryServiceLabel(value: string) {
  const cleaned = cleanEntityLabel(value)
    .replace(DISCOVERY_TRAILING_SERVICE_TERMS, "")
    .replace(/\b(?:for|with|from|by|and)\b\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!isQualityEntity(cleaned)) return null;
  if (DISCOVERY_GENERIC_PAGES.has(cleaned.toLowerCase())) return null;
  if (SERVICE_NOISE.test(cleaned)) return null;
  return cleaned;
}

function discoveryServiceBonus(source: EntitySource) {
  if (source === "url") return 4;
  if (source === "title" || source === "h1") return 2;
  return 1;
}

function normalizeCtaLabel(value: string) {
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();
  if (normalized === "book demo" || normalized === "book a demo") return "Book A Demo";
  if (normalized === "request demo" || normalized === "request a demo") return "Request A Demo";
  if (normalized === "start free trial") return "Start Free Trial";
  if (normalized === "start trial") return "Start Trial";
  if (normalized === "talk to sales") return "Talk To Sales";
  return titleCase(normalized);
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
  associatedCategories?: string[];
  supportingPages?: string[];
}

interface EcommerceDebugSummary {
  detectedBrands: EcommerceDebugEntry[];
  detectedCategories: EcommerceDebugEntry[];
  detectedProductTypes: EcommerceDebugEntry[];
  rejectedTerms: Array<{ term: string; reason: string }>;
}

interface BrandRelationshipDebugEntry {
  associatedCategories: string[];
  supportingPages: string[];
}

function mergeEcommerceDebug(
  debug: EcommerceDebugSummary | null,
  rejected: Array<{ term: string; reason: string; pageKey: string }>,
  brandRelationshipDiagnostics: Record<string, BrandRelationshipDebugEntry> = {}
) {
  if (!debug && !rejected.length) return null;
  const base = debug ?? { detectedBrands: [], detectedCategories: [], detectedProductTypes: [], rejectedTerms: [] };
  const combinedRejected = [
    ...base.rejectedTerms,
    ...rejected.slice(0, 40).map((item) => ({ term: item.term, reason: item.reason }))
  ];
  return {
    ...base,
    detectedBrands: base.detectedBrands.map((item) => ({
      ...item,
      associatedCategories: brandRelationshipDiagnostics[entityKey(item.label)]?.associatedCategories ?? [],
      supportingPages: brandRelationshipDiagnostics[entityKey(item.label)]?.supportingPages ?? []
    })),
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
    brandRecords: brandsResolved.map((item) => item.record),
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
  if (/\b(?:wellies|slippers|belts|eye masks|shirts?\s*(?:&|and)?\s*tops|trousers?\s*(?:&|and)?\s*shorts|hats?\s*(?:&|and)?\s*gloves|socks?\s*(?:&|and)?\s*tights)\b/.test(lower)) return true;
  if (/\b(?:casual|outdoor|everyday|skiwear|snowboard)\b/.test(lower)) return true;
  if (/\b(?:new in|new arrivals|sale|offers|clearance)\b/.test(lower)) return true;
  return false;
}

function buildBrandRelationshipDiagnostics(records: EntityRecord[], pages: SiteKnowledgePageDocument[]) {
  const pageMap = new Map(pages.map((page) => [page.url || page.id, page]));
  const entries: Array<[string, BrandRelationshipDebugEntry]> = records.map((record) => {
    const associatedCategories = new Set<string>();
    const supportingPages = [...record.pages]
      .map((pageKey) => pageMap.get(pageKey))
      .filter((page): page is SiteKnowledgePageDocument => Boolean(page))
      .sort((left, right) => ecommercePageKindPriority(ecommercePageKind(left.url)) - ecommercePageKindPriority(ecommercePageKind(right.url)))
      .slice(0, 4)
      .map((page) => page.url || page.id);
    for (const pageKey of record.pages) {
      const page = pageMap.get(pageKey);
      if (!page) continue;
      const text = `${page.title} ${page.h1} ${page.metaDescription} ${page.shortSummary}`;
      for (const relation of BRAND_RELATION_PATTERNS) {
        if (relation.pattern.test(text)) associatedCategories.add(relation.label);
      }
    }
    return [entityKey(record.label), {
      associatedCategories: [...associatedCategories],
      supportingPages
    }];
  });
  return Object.fromEntries(entries.filter((entry) => entry[1].associatedCategories.length || entry[1].supportingPages.length));
}

function ecommercePageKindPriority(kind: ReturnType<typeof ecommercePageKind>) {
  if (kind === "brand") return 1;
  if (kind === "about") return 2;
  if (kind === "homepage") return 3;
  if (kind === "collection") return 4;
  if (kind === "product") return 5;
  if (kind === "other") return 6;
  return 7;
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

function rankedEntitySubset(
  values: string[],
  titleContext: string,
  limit: number,
  type: "brand" | "category" | "product_type" | "audience" | "service",
  brandRelationships: Record<string, string[]> = {}
) {
  return values
    .map((value, index) => ({ value, score: entityRecommendationScore(value, index, titleContext, type, brandRelationships) }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.value)
    .slice(0, limit);
}

function entityRecommendationScore(
  value: string,
  index: number,
  titleContext: string,
  type: "brand" | "category" | "product_type" | "audience" | "service",
  brandRelationships: Record<string, string[]> = {}
) {
  const normalized = normalizeRecommendationText(value);
  const tokens = normalized.split(" ").filter((token) => token.length > 2);
  const overlap = tokens.reduce((total, token) => total + (titleContext.includes(token) ? 1 : 0), 0);
  const base = Math.max(0, 40 - index * 4);
  const typeBonus = type === "brand" ? 18 : type === "category" ? 16 : type === "product_type" ? 14 : type === "service" ? 14 : 8;
  const semanticBonus = recommendationSemanticBonus(value, titleContext, type, brandRelationships);
  return base + typeBonus + overlap * 12 + semanticBonus;
}

function recommendationSemanticBonus(
  value: string,
  titleContext: string,
  type: "brand" | "category" | "product_type" | "audience" | "service",
  brandRelationships: Record<string, string[]> = {}
) {
  const normalized = normalizeRecommendationText(value);
  if (!titleContext) return 0;
  if (type === "brand") {
    return brandRelationshipBonus(value, titleContext, brandRelationships);
  }
  if (type === "category") {
    if (normalized.includes("clothing") && /\b(?:wear|style|outfit|weekend|fashion|seaside|britain|british|holiday)\b/.test(titleContext)) return 14;
    if (normalized.includes("footwear") && /\b(?:walk|walking|weekend|travel|seaside|holiday|boots|shoes|sandals|trainers)\b/.test(titleContext)) return 14;
    if (normalized.includes("accessories") && /\b(?:accessories|bag|handbag|scarf|layering|style|weekend|gift)\b/.test(titleContext)) return 14;
    if (normalized.includes("gifts") && /\b(?:gift|gifts|present|ideas)\b/.test(titleContext)) return 16;
    if (normalized.includes("homeware") && /\b(?:home|interior|house|living)\b/.test(titleContext)) return 16;
    if (normalized.includes("beauty") && /\b(?:beauty|skincare|fragrance)\b/.test(titleContext)) return 16;
    if (normalized.includes("fragrance") && /\b(?:fragrance|perfume|scent)\b/.test(titleContext)) return 16;
  }
  if (type === "product_type") {
    return normalized.split(" ").reduce((score, token) => score + (titleContext.includes(token) ? 10 : 0), 0);
  }
  if (type === "audience") {
    if (normalized.includes("gift buyers") && /\b(?:gift|present)\b/.test(titleContext)) return 16;
    if ((normalized.includes("women") || normalized.includes("men")) && /\b(?:women|men|style|outfit|wear|fashion)\b/.test(titleContext)) return 10;
  }
  if (type === "service") {
    return normalized.split(" ").reduce((score, token) => score + (titleContext.includes(token) ? 10 : 0), 0);
  }
  return 0;
}

function brandRelationshipBonus(value: string, titleContext: string, brandRelationships: Record<string, string[]>) {
  const topics = detectTitleTopics(titleContext);
  const relations = brandRelationships[entityKey(value)] ?? [];
  let bonus = 0;
  if (/\b(?:wear|style|outfit|gift|weekend|holiday|seaside|shop|shopping|fashion)\b/.test(titleContext)) bonus += 6;
  const overlappingTopics = relations.filter((relation) => topics.has(relation));
  bonus += overlappingTopics.length * 18;
  if (topics.has("Fragrance") && relations.some((relation) => ["Fragrance", "Diffusers", "Candles", "Home Fragrance", "Gift Sets"].includes(relation))) bonus += 16;
  if (topics.has("Gifts") && relations.some((relation) => ["Gifts", "Gift Sets", "Fragrance", "Home Fragrance", "Diffusers", "Candles"].includes(relation))) bonus += 12;
  if (topics.has("Clothing") && relations.some((relation) => ["Clothing", "Outerwear", "Knitwear", "Accessories"].includes(relation))) bonus += 12;
  if (topics.has("Footwear") && relations.includes("Footwear")) bonus += 12;
  if (topics.has("Accessories") && relations.includes("Accessories")) bonus += 16;
  if (topics.size && relations.length && !overlappingTopics.length) bonus -= 12;
  return bonus;
}

function detectTitleTopics(titleContext: string) {
  const found = new Set<string>();
  for (const topic of TITLE_TOPIC_PATTERNS) {
    if (topic.pattern.test(titleContext)) found.add(topic.topic);
  }
  return found;
}

function normalizeRecommendationText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
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

function stringRecordArray(value: unknown) {
  const record = metadataRecord(value);
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, stringArrayFromUnknown(entry)])
  );
}
