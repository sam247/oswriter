import type { ContentControls, ProjectProfile, ProjectProfileSnapshot, ResearchPack, ResearchSource } from "@/lib/types";

export const PROFILE_VERSION = 1;
export const DEFAULT_TARGET_WORDS = 1400;

export const REGION_OPTIONS = [
  { key: "global", label: "Global" },
  { key: "united_kingdom", label: "United Kingdom" },
  { key: "united_states", label: "United States" },
  { key: "europe", label: "Europe" },
  { key: "canada", label: "Canada" },
  { key: "australia", label: "Australia" }
] as const;

export const AUDIENCE_OPTIONS = [
  { key: "general_audience", label: "General Audience" },
  { key: "technical_professionals", label: "Technical Professionals" },
  { key: "business_owners", label: "Business Owners" },
  { key: "executives", label: "Executives" },
  { key: "consumers", label: "Consumers" },
  { key: "developers", label: "Developers" },
  { key: "procurement_teams", label: "Procurement Teams" }
] as const;

export const INDUSTRY_OPTIONS = [
  { key: "general", label: "General" },
  { key: "construction", label: "Construction" },
  { key: "utilities", label: "Utilities" },
  { key: "saas", label: "SaaS" },
  { key: "legal", label: "Legal" },
  { key: "healthcare", label: "Healthcare" },
  { key: "compliance", label: "Compliance" },
  { key: "travel", label: "Travel" },
  { key: "finance", label: "Finance" },
  { key: "ecommerce", label: "Ecommerce" },
  { key: "education", label: "Education" },
  { key: "custom", label: "Custom Industry" }
] as const;

export type RegionKey = typeof REGION_OPTIONS[number]["key"];
export type AudienceKey = typeof AUDIENCE_OPTIONS[number]["key"];
export type IndustryKey = typeof INDUSTRY_OPTIONS[number]["key"];

const REGION_LABELS = new Map(REGION_OPTIONS.map((item) => [item.key, item.label]));
const AUDIENCE_LABELS = new Map(AUDIENCE_OPTIONS.map((item) => [item.key, item.label]));
const INDUSTRY_LABELS = new Map(INDUSTRY_OPTIONS.map((item) => [item.key, item.label]));

export function createDefaultProjectProfile(targetWords = DEFAULT_TARGET_WORDS): ProjectProfile {
  return normalizeProjectProfile({ defaultTargetWords: targetWords });
}

export function normalizeProjectProfile(input: Partial<ProjectProfile> | null | undefined, fallbackTargetWords = DEFAULT_TARGET_WORDS): ProjectProfile {
  const regionKey = optionKey(input?.regionKey, REGION_LABELS, "global");
  const audienceKey = optionKey(input?.audienceKey, AUDIENCE_LABELS, "general_audience");
  const industryKey = optionKey(input?.industryKey, INDUSTRY_LABELS, "general");
  const customIndustryLabel = industryKey === "custom" ? cleanCustomIndustry(input?.customIndustryLabel ?? input?.industryLabel) : undefined;
  const industryLabel = industryKey === "custom" ? customIndustryLabel || "Custom Industry" : INDUSTRY_LABELS.get(industryKey) ?? "General";
  return {
    profileVersion: PROFILE_VERSION,
    regionKey,
    regionLabel: REGION_LABELS.get(regionKey) ?? "Global",
    industryKey,
    industryLabel,
    customIndustryLabel,
    audienceKey,
    audienceLabel: AUDIENCE_LABELS.get(audienceKey) ?? "General Audience",
    defaultTargetWords: clampTargetWords(input?.defaultTargetWords ?? fallbackTargetWords)
  };
}

export function snapshotProjectProfile(profile: ProjectProfile): ProjectProfileSnapshot {
  const normalized = normalizeProjectProfile(profile);
  return {
    profileVersion: normalized.profileVersion,
    region: normalized.regionKey,
    regionLabel: normalized.regionLabel,
    industry: normalized.industryKey === "custom" ? normalizeCustomIndustryKey(normalized.customIndustryLabel) : normalized.industryKey,
    industryLabel: normalized.industryLabel,
    audience: normalized.audienceKey,
    audienceLabel: normalized.audienceLabel,
    targetWords: normalized.defaultTargetWords,
    regionAwarenessActive: normalized.regionKey !== "global",
    industryAwarenessActive: normalized.industryKey !== "general",
    audienceAwarenessActive: normalized.audienceKey !== "general_audience"
  };
}

export function projectProfileFromControls(profile: ProjectProfile | undefined, controls: ContentControls): ProjectProfile {
  return normalizeProjectProfile(profile, controls.lengthTargetWords);
}

export function calculateProfileRelevanceScore(input: {
  snapshot?: ProjectProfileSnapshot | null;
  research?: Pick<ResearchPack, "sources" | "usefulFacts"> | null;
  markdown?: string;
}) {
  const snapshot = input.snapshot;
  if (!snapshot || snapshot.profileVersion === 0) return null;
  const text = [
    input.markdown ?? "",
    ...(input.research?.usefulFacts ?? []),
    ...(input.research?.sources ?? []).flatMap(sourceText)
  ].join(" ").toLowerCase();
  const domains = (input.research?.sources ?? []).map((source) => source.domain.toLowerCase());
  const regional = profileMatchScore(snapshot.region, text, domains);
  const industry = profileMatchScore(snapshot.industry, text, domains);
  const audience = profileMatchScore(snapshot.audience, text, domains);
  return Math.round((regional + industry + audience) / 3);
}

export function profileSourcePreference(source: ResearchSource, snapshot?: ProjectProfileSnapshot | null) {
  if (!snapshot) return 0;
  const text = sourceText(source).join(" ").toLowerCase();
  const domain = source.domain.toLowerCase();
  let score = 0;
  score += sourcePreferenceFor(snapshot.region, text, domain);
  score += sourcePreferenceFor(snapshot.industry, text, domain);
  score += sourcePreferenceFor(snapshot.audience, text, domain);
  return score;
}

export function profileContextLines(snapshot?: ProjectProfileSnapshot | null) {
  if (!snapshot) return [];
  return [
    `Region: ${snapshot.regionLabel}`,
    `Industry: ${snapshot.industryLabel}`,
    `Audience: ${snapshot.audienceLabel}`,
    `Target words: ${snapshot.targetWords}`,
    `Preference: use sources, terminology, examples and standards that fit the region, industry and audience.`
  ];
}

export function clampTargetWords(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(300, Math.min(5000, Math.round(number))) : DEFAULT_TARGET_WORDS;
}

function optionKey<T extends string>(value: unknown, labels: Map<T, string>, fallback: T): T {
  return typeof value === "string" && labels.has(value as T) ? value as T : fallback;
}

function cleanCustomIndustry(value: unknown) {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, 80);
  return cleaned || undefined;
}

function normalizeCustomIndustryKey(value: unknown) {
  const cleaned = cleanCustomIndustry(value);
  return cleaned ? cleaned.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "custom" : "custom";
}

function sourceText(source: ResearchSource) {
  return [source.title, source.domain, source.summary ?? "", source.text ?? "", ...source.highlights];
}

function profileMatchScore(key: string, text: string, domains: string[]) {
  if (key === "global" || key === "general" || key === "general_audience") return 70;
  const signals = PROFILE_SIGNALS[key] ?? [key.replace(/_/g, " ")];
  const matches = signals.filter((signal) => text.includes(signal) || domains.some((domain) => domain.includes(signal))).length;
  return Math.max(45, Math.min(100, 55 + matches * 15));
}

function sourcePreferenceFor(key: string, text: string, domain: string) {
  if (key === "global" || key === "general" || key === "general_audience") return 0;
  const signals = PROFILE_SIGNALS[key] ?? [key.replace(/_/g, " ")];
  return signals.reduce((score, signal) => score + (text.includes(signal) || domain.includes(signal) ? 8 : 0), 0);
}

const PROFILE_SIGNALS: Record<string, string[]> = {
  united_kingdom: ["uk", "gov.uk", "british", "bsi", "hse", "ofwat", "planningportal", "legislation.gov.uk"],
  united_states: ["united states", "us", "federal", ".gov", "state law", "osha"],
  europe: ["europe", "eu", "european", "eur-lex", "directive", "regulation"],
  canada: ["canada", "canadian", ".gc.ca"],
  australia: ["australia", "australian", ".gov.au"],
  construction: ["construction", "building", "contractor", "groundwork", "engineering", "structural", "bsi", "ice"],
  utilities: ["utilities", "water", "electricity", "gas", "ofwat", "utility", "infrastructure"],
  saas: ["saas", "software", "subscription", "cloud", "platform"],
  legal: ["legal", "law", "case law", "statute", "regulation"],
  healthcare: ["healthcare", "clinical", "patient", "nhs", "medical"],
  compliance: ["compliance", "regulation", "audit", "risk", "directive"],
  travel: ["travel", "tourism", "destination", "hotel", "flight"],
  finance: ["finance", "financial", "bank", "tax", "investment"],
  ecommerce: ["ecommerce", "shopify", "commerce", "product", "retail"],
  education: ["education", "school", "university", "student", "curriculum"],
  technical_professionals: ["technical", "standard", "implementation", "engineering", "specification"],
  developers: ["developer", "api", "code", "implementation", "technical"],
  procurement_teams: ["procurement", "supplier", "vendor", "tender", "contract", "evaluation"],
  business_owners: ["business", "commercial", "cost", "risk", "operations"],
  executives: ["executive", "strategy", "commercial", "roi", "decision"],
  consumers: ["consumer", "homeowner", "simple", "practical", "cost"]
};
