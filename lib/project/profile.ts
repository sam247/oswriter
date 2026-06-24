import type { ContentControls, ProjectProfile, ProjectProfileSnapshot, ResearchPack, ResearchSource } from "@/lib/types";

export const PROFILE_VERSION = 2;
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
  { key: "procurement_teams", label: "Procurement Teams" },
  { key: "project_managers", label: "Project Managers" },
  { key: "site_managers", label: "Site Managers" },
  { key: "contractors", label: "Contractors" },
  { key: "commercial_managers", label: "Commercial Managers" },
  { key: "developers", label: "Developers" },
  { key: "engineering_managers", label: "Engineering Managers" },
  { key: "product_managers", label: "Product Managers" },
  { key: "ctos", label: "CTOs" },
  { key: "technical_decision_makers", label: "Technical Decision Makers" },
  { key: "store_owners", label: "Store Owners" },
  { key: "ecommerce_managers", label: "Ecommerce Managers" },
  { key: "marketing_managers", label: "Marketing Managers" },
  { key: "operations_managers", label: "Operations Managers" },
  { key: "it_managers", label: "IT Managers" },
  { key: "security_managers", label: "Security Managers" },
  { key: "cisos", label: "CISOs" },
  { key: "business_leaders", label: "Business Leaders" },
  { key: "finance_directors", label: "Finance Directors" },
  { key: "practice_managers", label: "Practice Managers" },
  { key: "healthcare_leaders", label: "Healthcare Leaders" },
  { key: "clinical_administrators", label: "Clinical Administrators" },
  { key: "business_owners", label: "Business Owners" },
] as const;

export const INDUSTRY_OPTIONS = [
  { key: "general", label: "General" },
  { key: "construction", label: "Construction" },
  { key: "saas", label: "SaaS" },
  { key: "ecommerce", label: "Ecommerce" },
  { key: "cyber_security", label: "Cyber Security" },
  { key: "finance", label: "Finance" },
  { key: "healthcare", label: "Healthcare" },
  { key: "local_business", label: "Local Business" }
] as const;

export const BUSINESS_TYPE_OPTIONS = [
  { key: "auto_detect", label: "Auto Detect" },
  { key: "ecommerce", label: "Ecommerce" },
  { key: "service_business", label: "Service Business" },
  { key: "local_service", label: "Local Service" },
  { key: "agency", label: "Agency" },
  { key: "saas", label: "SaaS" },
  { key: "charity", label: "Charity" }
] as const;

export type RegionKey = typeof REGION_OPTIONS[number]["key"];
export type AudienceKey = typeof AUDIENCE_OPTIONS[number]["key"];
export type IndustryKey = typeof INDUSTRY_OPTIONS[number]["key"];
export type BusinessTypeKey = typeof BUSINESS_TYPE_OPTIONS[number]["key"];

const REGION_LABELS = new Map(REGION_OPTIONS.map((item) => [item.key, item.label]));
const AUDIENCE_LABELS = new Map(AUDIENCE_OPTIONS.map((item) => [item.key, item.label]));
const INDUSTRY_LABELS = new Map(INDUSTRY_OPTIONS.map((item) => [item.key, item.label]));
const BUSINESS_TYPE_LABELS = new Map(BUSINESS_TYPE_OPTIONS.map((item) => [item.key, item.label]));

export const INDUSTRY_AUDIENCES: Record<IndustryKey, readonly AudienceKey[]> = {
  construction: ["procurement_teams", "project_managers", "site_managers", "contractors", "commercial_managers"],
  saas: ["developers", "engineering_managers", "product_managers", "ctos", "technical_decision_makers"],
  ecommerce: ["store_owners", "ecommerce_managers", "marketing_managers", "operations_managers"],
  cyber_security: ["it_managers", "security_managers", "cisos", "technical_decision_makers"],
  finance: ["business_leaders", "finance_directors", "procurement_teams", "operations_managers"],
  healthcare: ["practice_managers", "operations_managers", "healthcare_leaders", "procurement_teams", "clinical_administrators"],
  local_business: ["business_owners", "marketing_managers", "operations_managers"],
  general: ["general_audience"]
};

const DEFAULT_AUDIENCE_BY_INDUSTRY: Record<IndustryKey, AudienceKey> = {
  construction: "procurement_teams",
  saas: "developers",
  ecommerce: "store_owners",
  cyber_security: "it_managers",
  finance: "business_leaders",
  healthcare: "practice_managers",
  local_business: "business_owners",
  general: "general_audience"
};

export function createDefaultProjectProfile(targetWords = DEFAULT_TARGET_WORDS): ProjectProfile {
  return normalizeProjectProfile({ defaultTargetWords: targetWords });
}

export function normalizeProjectProfile(input: Partial<ProjectProfile> | null | undefined, fallbackTargetWords = DEFAULT_TARGET_WORDS): ProjectProfile {
  const regionKey = optionKey(input?.regionKey, REGION_LABELS, "global");
  const industryKey = optionKey(input?.industryKey, INDUSTRY_LABELS, "general");
  const requestedAudience = optionKey(input?.audienceKey, AUDIENCE_LABELS, defaultAudienceForIndustry(industryKey));
  const audienceKey = INDUSTRY_AUDIENCES[industryKey].includes(requestedAudience) ? requestedAudience : defaultAudienceForIndustry(industryKey);
  const businessTypeKey = optionKey(input?.businessTypeKey, BUSINESS_TYPE_LABELS, "auto_detect");
  return {
    profileVersion: PROFILE_VERSION,
    regionKey,
    regionLabel: REGION_LABELS.get(regionKey) ?? "Global",
    industryKey,
    industryLabel: INDUSTRY_LABELS.get(industryKey) ?? "General",
    audienceKey,
    audienceLabel: AUDIENCE_LABELS.get(audienceKey) ?? "General Audience",
    businessTypeKey,
    businessTypeLabel: BUSINESS_TYPE_LABELS.get(businessTypeKey) ?? "Auto Detect",
    defaultTargetWords: clampTargetWords(input?.defaultTargetWords ?? fallbackTargetWords)
  };
}

export function snapshotProjectProfile(profile: ProjectProfile): ProjectProfileSnapshot {
  const normalized = normalizeProjectProfile(profile);
  return {
    profileVersion: normalized.profileVersion,
    region: normalized.regionKey,
    regionLabel: normalized.regionLabel,
    industry: normalized.industryKey,
    industryLabel: normalized.industryLabel,
    audience: normalized.audienceKey,
    audienceLabel: normalized.audienceLabel,
    businessType: normalized.businessTypeKey,
    businessTypeLabel: normalized.businessTypeLabel,
    profileKey: profileKeyFor(normalized.industryKey, normalized.audienceKey),
    targetWords: normalized.defaultTargetWords,
    regionAwarenessActive: normalized.regionKey !== "global",
    industryAwarenessActive: normalized.industryKey !== "general",
    audienceAwarenessActive: normalized.audienceKey !== "general_audience"
  };
}

export function audienceOptionsForIndustry(industry: string | null | undefined) {
  const industryKey = optionKey(industry, INDUSTRY_LABELS, "general");
  const allowed = new Set(INDUSTRY_AUDIENCES[industryKey]);
  return AUDIENCE_OPTIONS.filter((option) => allowed.has(option.key));
}

export function defaultAudienceForIndustry(industry: string | null | undefined): AudienceKey {
  const industryKey = optionKey(industry, INDUSTRY_LABELS, "general");
  return DEFAULT_AUDIENCE_BY_INDUSTRY[industryKey];
}

export function profileKeyFor(industry: string | null | undefined, audience: string | null | undefined) {
  const normalizedIndustry = normalizeKey(industry, "general");
  const normalizedAudience = normalizeKey(audience, defaultAudienceForIndustry(normalizedIndustry));
  return `${normalizedIndustry}_${normalizedAudience}`;
}

export function planningPrioritiesForProfile(snapshot?: ProjectProfileSnapshot | null) {
  if (!snapshot) return [];
  return PROFILE_PLANNING_PRIORITIES[profileKeyFor(snapshot.industry, snapshot.audience)]
    ?? AUDIENCE_PLANNING_PRIORITIES[snapshot.audience]
    ?? [];
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
  const planningPriorities = planningPrioritiesForProfile(snapshot);
  return [
    `Region: ${snapshot.regionLabel}`,
    `Industry: ${snapshot.industryLabel}`,
    `Audience: ${snapshot.audienceLabel}`,
    `Business type: ${snapshot.businessTypeLabel}`,
    `Target words: ${snapshot.targetWords}`,
    ...(planningPriorities.length ? [`Planning priorities: ${planningPriorities.join(", ")}`] : []),
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

function normalizeKey(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || fallback;
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
  saas: ["saas", "software", "subscription", "cloud", "platform"],
  healthcare: ["healthcare", "clinical", "patient", "nhs", "medical"],
  finance: ["finance", "financial", "bank", "tax", "investment"],
  ecommerce: ["ecommerce", "shopify", "commerce", "product", "retail"],
  cyber_security: ["cyber security", "security", "threat", "vulnerability", "risk"],
  local_business: ["local business", "small business", "local market", "community"],
  developers: ["developer", "api", "code", "implementation", "technical"],
  procurement_teams: ["procurement", "supplier", "vendor", "tender", "contract", "evaluation"],
  business_owners: ["business", "commercial", "cost", "risk", "operations"],
  project_managers: ["programme", "delivery", "sequence", "schedule", "resource"],
  ctos: ["scalability", "strategy", "architecture", "risk", "business impact"],
  practice_managers: ["operations", "patient experience", "compliance", "staffing", "efficiency"],
  business_leaders: ["commercial impact", "risk", "cash flow", "strategy"]
};

const PROFILE_PLANNING_PRIORITIES: Record<string, string[]> = {
  construction_procurement_teams: ["costs", "supplier selection", "procurement strategy", "compliance", "risk", "lead times"],
  construction_project_managers: ["programme delivery", "sequencing", "resources", "scheduling", "risk mitigation"],
  saas_developers: ["implementation", "architecture", "APIs", "technical examples", "code concepts"],
  saas_ctos: ["scalability", "strategy", "architecture decisions", "risk", "business impact"],
  healthcare_practice_managers: ["operations", "patient experience", "compliance", "staffing", "efficiency"],
  finance_business_leaders: ["commercial impact", "risk", "cash flow", "strategic decisions"]
};

const AUDIENCE_PLANNING_PRIORITIES: Record<string, string[]> = {
  procurement_teams: ["costs", "supplier selection", "compliance", "risk", "lead times"],
  developers: ["implementation", "architecture", "APIs", "technical examples"],
  technical_decision_makers: ["architecture decisions", "risk", "scalability", "business impact"],
  operations_managers: ["operations", "efficiency", "process", "resources", "risk"],
  marketing_managers: ["audience demand", "positioning", "channels", "measurement"],
  business_owners: ["commercial impact", "costs", "operations", "growth"],
  general_audience: ["clarity", "practical guidance", "accessible examples"]
};
