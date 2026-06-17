import { profileSourcePreference } from "@/lib/project/profile";
import type { ProjectProfileSnapshot, ResearchSource, SearchResult } from "@/lib/types";
import { domainFromUrl } from "@/lib/text";

const AUTHORITY_DOMAINS = [
  "gov.uk",
  "legislation.gov.uk",
  "ofwat.gov.uk",
  "water.org.uk",
  "planningportal.co.uk",
  "bsi.group",
  "ice.org.uk"
];

const BAD_DOMAINS = [
  "dictionary.com",
  "merriam-webster.com",
  "thesaurus.com",
  "collinsdictionary.com",
  "yourdictionary.com",
  "definitions.net"
];

const BAD_URL_PATTERNS = [
  /privacy/i,
  /cookie/i,
  /tag\//i,
  /category\//i,
  /author\//i,
  /glossary/i
];

export function buildQueryVariants(title: string, profileSnapshot?: ProjectProfileSnapshot | null) {
  const cleaned = title
    .replace(/\b(explained|guide|complete guide|ultimate guide)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const variants = [
    title,
    cleaned,
    `${cleaned} guidance`,
    `${cleaned} requirements`,
    `${cleaned} standard`,
    `${cleaned} legislation`
  ];
  if (profileSnapshot?.region === "united_kingdom") variants.push(`${cleaned} UK`);
  if (profileSnapshot?.region === "united_states") variants.push(`${cleaned} US`);
  if (profileSnapshot?.region === "europe") variants.push(`${cleaned} EU`);
  return [...new Set(variants.filter(Boolean))];
}

export function toResearchSource(result: SearchResult, title: string, index: number, profileSnapshot?: ProjectProfileSnapshot | null): ResearchSource {
  const domain = domainFromUrl(result.url);
  const text = [result.title, result.summary, result.text, ...(result.highlights ?? [])].join(" ").toLowerCase();
  const titleTokens = title.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
  const overlap = titleTokens.filter((token) => text.includes(token)).length;
  const relevanceScore = Math.min(100, Math.round((overlap / Math.max(titleTokens.length, 1)) * 80 + (result.summary || result.text ? 20 : 0)));
  const authorityScore = authorityForDomain(domain);
  const rejectionReason = rejectionReasonFor(result.url, domain, title);
  const source: ResearchSource = {
    id: `src_${index}`,
    title: result.title || result.url,
    url: result.url,
    domain,
    text: result.text,
    summary: result.summary,
    highlights: result.highlights ?? [],
    authorityScore,
    relevanceScore,
    accepted: !rejectionReason && relevanceScore >= 25,
    rejectionReason
  };
  const preference = profileSourcePreference(source, profileSnapshot);
  return {
    ...source,
    authorityScore: Math.min(100, authorityScore + Math.round(preference * 0.6)),
    relevanceScore: Math.min(100, relevanceScore + Math.round(preference * 0.4))
  };
}

export function authorityForDomain(domain: string) {
  if (!domain) return 20;
  if (AUTHORITY_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return 95;
  if (domain.endsWith(".gov.uk")) return 94;
  if (domain.endsWith(".ac.uk")) return 88;
  if (domain.includes("water") || domain.includes("council") || domain.includes("authority")) return 78;
  if (domain.includes("wikipedia")) return 45;
  return 60;
}

export function rejectionReasonFor(url: string, domain: string, title: string) {
  const asksDefinition = /\b(what is|definition|meaning|define)\b/i.test(title);
  if (!asksDefinition && BAD_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return "Dictionary/thesaurus source rejected for non-definition specialist article.";
  }
  if (BAD_URL_PATTERNS.some((pattern) => pattern.test(url))) {
    return "Navigation, glossary, privacy, cookie, tag, or category page rejected.";
  }
  return undefined;
}

export function average(nums: number[]) {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length);
}
