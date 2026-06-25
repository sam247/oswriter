import { sameRegisteredDomain } from "@/lib/text";

export type ResearchSourceClass = "allowed" | "neutral" | "excluded";

export interface SourceClassification {
  sourceClass: ResearchSourceClass;
  sourceCategory: string;
  rejectionReason?: string;
}

const STANDARDS_DOMAINS = [
  "bsi.group",
  "iso.org",
  "iec.ch",
  "ieee.org",
  "astm.org",
  "en-standard.eu",
  "standardsuk.com"
];

const NEWS_DOMAINS = [
  "bbc.co.uk",
  "bbc.com",
  "reuters.com",
  "apnews.com",
  "theguardian.com",
  "ft.com",
  "constructionnews.co.uk",
  "theconstructionindex.co.uk",
  "building.co.uk"
];

const NEUTRAL_DOMAINS = [
  "reddit.com",
  "medium.com",
  "linkedin.com",
  "quora.com",
  "stackoverflow.com",
  "stackexchange.com"
];

const SPAM_PATTERNS = [
  /free-?essay/i,
  /assignment-?help/i,
  /casino|gambling|betting/i,
  /coupon|voucher|promo-?code/i,
  /essaywriter|write-?my-?essay/i
];

const AI_SCRAPER_PATTERNS = [
  /(^|\.)aitool/i,
  /(^|\.)ai-?search/i,
  /(^|\.)content-?bot/i,
  /(^|\.)answer-?the-?public/i,
  /(^|\.)summar(y|izer)/i,
  /ai-?generated/i
];

const PAYWALL_PATTERNS = [
  /\/subscribe/i,
  /\/subscription/i,
  /\/paywall/i,
  /\/premium/i,
  /\/members-only/i
];

export function classifyResearchSource(input: {
  url: string;
  domain: string;
  title?: string;
  text?: string;
  summary?: string;
  highlights?: string[];
  projectRegisteredDomain?: string;
}): SourceClassification {
  const haystack = [input.url, input.domain, input.title ?? ""].join(" ");
  if (input.projectRegisteredDomain && sameRegisteredDomain(input.url, input.projectRegisteredDomain)) {
    return { sourceClass: "excluded", sourceCategory: "same_project_domain", rejectionReason: "Same project domain." };
  }
  if (SPAM_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return { sourceClass: "excluded", sourceCategory: "obvious_spam", rejectionReason: "Obvious spam source." };
  }
  if (AI_SCRAPER_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return { sourceClass: "excluded", sourceCategory: "ai_generated_scraper", rejectionReason: "AI-generated scraper site." };
  }
  if (PAYWALL_PATTERNS.some((pattern) => pattern.test(input.url))) {
    return { sourceClass: "excluded", sourceCategory: "paywalled", rejectionReason: "Paywalled source." };
  }
  if (!hasExtractedContent(input)) {
    return { sourceClass: "excluded", sourceCategory: "failed_extraction", rejectionReason: "Failed extraction." };
  }
  if (isNeutralDomain(input.domain)) return { sourceClass: "neutral", sourceCategory: neutralCategory(input.domain) };
  if (isGovernmentDomain(input.domain)) return { sourceClass: "allowed", sourceCategory: "government" };
  if (domainMatches(input.domain, STANDARDS_DOMAINS)) return { sourceClass: "allowed", sourceCategory: "standards" };
  if (isUniversityDomain(input.domain)) return { sourceClass: "allowed", sourceCategory: "universities" };
  if (domainMatches(input.domain, NEWS_DOMAINS)) return { sourceClass: "allowed", sourceCategory: "news" };
  if (isIndustryBody(input.domain)) return { sourceClass: "allowed", sourceCategory: "industry_bodies" };
  if (isLikelyManufacturer(input.domain, input.title ?? "")) return { sourceClass: "allowed", sourceCategory: "manufacturers" };
  return { sourceClass: "allowed", sourceCategory: "independent_businesses" };
}

export function duplicateSourceClassification(): SourceClassification {
  return { sourceClass: "excluded", sourceCategory: "duplicate_url", rejectionReason: "Duplicate URL." };
}

export function rejectionSummaryLabel(reason?: string) {
  const value = reason ?? "";
  if (/same project domain/i.test(value)) return "Same project domain";
  if (/duplicate url/i.test(value)) return "Duplicate URL";
  if (/obvious spam/i.test(value)) return "Obvious spam";
  if (/AI-generated scraper/i.test(value)) return "AI-generated scraper site";
  if (/paywalled/i.test(value)) return "Paywalled";
  if (/failed extraction/i.test(value)) return "Failed extraction";
  if (/low relevance/i.test(value)) return "Low relevance";
  if (/dictionary|thesaurus/i.test(value)) return "Dictionary/thesaurus";
  if (/navigation|glossary|privacy|cookie|tag|category/i.test(value)) return "Navigation or utility page";
  return "Outside accepted source set";
}

function hasExtractedContent(input: { text?: string; summary?: string; highlights?: string[] }) {
  return Boolean(input.text?.trim() || input.summary?.trim() || input.highlights?.some((item) => item.trim()));
}

function isGovernmentDomain(domain: string) {
  return domain.endsWith(".gov") || domain.endsWith(".gov.uk") || domain === "gov.uk" || domain.endsWith(".gouv.fr");
}

function isUniversityDomain(domain: string) {
  return domain.endsWith(".edu") || domain.endsWith(".ac.uk") || /\.edu\./.test(domain) || /university|college/.test(domain);
}

function isNeutralDomain(domain: string) {
  return domainMatches(domain, NEUTRAL_DOMAINS) || /(^|\.)forum(s)?\./.test(domain) || /forum|community/.test(domain);
}

function neutralCategory(domain: string) {
  if (domainMatches(domain, ["reddit.com"])) return "reddit";
  if (domainMatches(domain, ["medium.com"])) return "medium";
  if (domainMatches(domain, ["linkedin.com"])) return "linkedin";
  return "forums";
}

function isIndustryBody(domain: string) {
  return /association|federation|institute|institution|society|council|authority|alliance|trade|industry/.test(domain)
    || domainMatches(domain, ["ice.org.uk", "water.org.uk", "ofwat.gov.uk", "planningportal.co.uk"]);
}

function isLikelyManufacturer(domain: string, title: string) {
  return /manufacturer|manufacturing|products|product|supplier|materials|systems/.test(`${domain} ${title}`.toLowerCase());
}

function domainMatches(domain: string, domains: string[]) {
  return domains.some((item) => domain === item || domain.endsWith(`.${item}`));
}
