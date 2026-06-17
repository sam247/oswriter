import { calculateProfileRelevanceScore } from "@/lib/project/profile";
import type { ProjectProfileSnapshot, ResearchFactSource, ResearchPack, SearchAdapter, SearchResult } from "@/lib/types";
import { buildQueryVariants, average, toResearchSource } from "@/lib/research/scoring";
import { nowIso } from "@/lib/defaults";
import { estimatedExaContentCostUsd, estimatedExaSearchCostUsd, estimateResearchCostUsd } from "@/lib/telemetry/costs";

const EXCLUDE_DOMAINS = [
  "dictionary.com",
  "merriam-webster.com",
  "thesaurus.com",
  "collinsdictionary.com",
  "yourdictionary.com",
  "definitions.net"
];

const KNOWN_CONCEPT_PATTERNS: Array<[RegExp, string]> = [
  [/\bbasic authentication\b|\bbasic auth\b/i, "Basic Authentication"],
  [/\bapi keys?\b/i, "API Keys"],
  [/\bsessions?\b|\bsession cookies?\b/i, "Sessions"],
  [/\bjwts?\b|\bjson web tokens?\b/i, "JWT"],
  [/\boauth\s*2(?:\.0)?\b|\boauth\b/i, "OAuth 2.0"],
  [/\bopenid connect\b|\boidc\b/i, "OpenID Connect"],
  [/\bmutual tls\b|\bmtls\b|\bclient certificates?\b/i, "Mutual TLS"],
  [/\bsigned requests?\b|\brequest signing\b|\bhmac\b/i, "Signed Requests"],
  [/\bbearer tokens?\b/i, "Bearer Tokens"],
  [/\bsaml\b/i, "SAML"],
  [/\bsingle sign-?on\b|\bsso\b/i, "Single Sign-On"],
  [/\bwebhooks?\b/i, "Webhooks"],
  [/\brate limits?\b|\bratelimits?\b/i, "Rate Limits"],
  [/\bpermissions?\b|\bscopes?\b/i, "Permissions And Scopes"],
  [/\brefresh tokens?\b/i, "Refresh Tokens"]
];

export async function runResearch(title: string, articleId: string, search: SearchAdapter, profileSnapshot?: ProjectProfileSnapshot | null): Promise<ResearchPack> {
  const started = Date.now();
  const queries = buildQueryVariants(title, profileSnapshot);
  const seen = new Set<string>();
  const raw: SearchResult[] = [];
  const requestIds: string[] = [];
  let exaSearchRequests = queries.length;
  let exaContentPages = 0;

  const responses = await Promise.allSettled(queries.map((query) => search.search(query, {
      numResults: 5,
      excludeDomains: EXCLUDE_DOMAINS
    })));

  const failures = responses.filter((response) => response.status === "rejected");
  for (const response of responses) {
    if (response.status === "rejected") continue;
    const { results, requestId } = response.value;
    exaContentPages += response.value.usage?.exaContentPages ?? results.filter((result) => result.text || result.summary || (result.highlights?.length ?? 0) > 0).length;
    if (requestId) requestIds.push(requestId);
    for (const result of results) {
      if (!seen.has(result.url)) {
        seen.add(result.url);
        raw.push(result);
      }
    }
    if (raw.length >= 30) break;
  }

  if (raw.length === 0 && failures.length === responses.length) {
    const first = failures[0] as PromiseRejectedResult | undefined;
    const message = first?.reason instanceof Error ? first.reason.message : String(first?.reason ?? "unknown");
    throw new Error(`Research/search completely unavailable: ${message}`);
  }

  const scored = raw.slice(0, 30).map((result, index) => toResearchSource(result, title, index + 1, profileSnapshot));
  const accepted = scored
    .filter((source) => source.accepted)
    .sort((a, b) => (b.authorityScore + b.relevanceScore) - (a.authorityScore + a.relevanceScore))
    .slice(0, 12)
    .map((source) => ({ ...source, accepted: true, rejectionReason: undefined }));
  const acceptedUrls = new Set(accepted.map((source) => source.url));
  const rejected = scored
    .filter((source) => !acceptedUrls.has(source.url))
    .map((source) => ({
      ...source,
      accepted: false,
      rejectionReason: source.rejectionReason ?? "Outside accepted source set for this research run."
    }));
  const usefulFactSources = extractFacts(accepted);
  const usefulFacts = usefulFactSources.map((item) => item.fact);
  const questionsFound = extractQuestions(accepted, title);
  const headingsFound = extractHeadings(accepted);
  const researchConcepts = extractResearchConcepts(title, accepted, usefulFacts);
  const authorityScore = average(accepted.map((source) => source.authorityScore));
  const relevanceScore = average(accepted.map((source) => source.relevanceScore));
  const confidence = Math.round((authorityScore * 0.45) + (relevanceScore * 0.35) + (Math.min(accepted.length, 8) / 8 * 20));
  const warnings: string[] = [];
  const profileRelevanceScore = calculateProfileRelevanceScore({ snapshot: profileSnapshot, research: { sources: accepted, usefulFacts } });

  if (accepted.length < 2) warnings.push("Research found fewer than 2 usable sources.");
  else if (accepted.length < 4) warnings.push("Research source coverage is below the preferred 4+ usable sources.");
  if (confidence < 60) warnings.push("Research confidence is low.");
  if (failures.length) warnings.push(`${failures.length} research query variants failed, but generation continued.`);

  return {
    articleId,
    title,
    queries,
    sources: accepted,
    rejectedSources: rejected,
    usefulFacts,
    usefulFactSources,
    rejectedFacts: rejected.slice(0, 8).map((source) => `${source.title}: ${source.rejectionReason ?? "low relevance or authority"}`),
    questionsFound,
    headingsFound,
    researchConcepts,
    researchConceptCount: researchConcepts.length,
    authorityScore,
    relevanceScore,
    confidence,
    warnings,
    requestIds: [...new Set(requestIds)],
    durationMs: Date.now() - started,
    exaSearchCalls: exaSearchRequests,
    exaContentCalls: exaContentPages,
    exaSearchRequests,
    exaContentPages,
    estimatedExaSearchCostUsd: estimatedExaSearchCostUsd(exaSearchRequests),
    estimatedExaContentCostUsd: estimatedExaContentCostUsd(exaContentPages),
    estimatedResearchCostUsd: estimateResearchCostUsd(exaSearchRequests, exaContentPages),
    profileSnapshot,
    profileRelevanceScore,
    createdAt: nowIso()
  };
}

export function extractResearchConcepts(title: string, sources: ResearchPack["sources"], usefulFacts: string[] = []) {
  const text = [
    title,
    ...sources.flatMap((source) => [source.title, source.summary, ...(source.highlights ?? []), source.text]),
    ...usefulFacts
  ].filter(Boolean).join(" ");
  const candidates = new Map<string, { label: string; score: number }>();

  for (const [pattern, label] of KNOWN_CONCEPT_PATTERNS) {
    if (pattern.test(text)) addConcept(candidates, label, 8);
  }

  for (const source of sources) {
    for (const label of conceptCandidatesFromText([source.title, source.summary, ...(source.highlights ?? [])].filter(Boolean).join(" "))) {
      addConcept(candidates, label, source.title.toLowerCase().includes(label.toLowerCase()) ? 4 : 2);
    }
  }

  for (const label of conceptCandidatesFromText(usefulFacts.join(" "))) {
    addConcept(candidates, label, 1);
  }

  return [...candidates.values()]
    .filter((item) => usefulConcept(item.label, title))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .map((item) => item.label)
    .slice(0, 20);
}

function conceptCandidatesFromText(text: string) {
  const candidates = new Set<string>();
  for (const match of text.matchAll(/\b(?:[A-Z][a-z0-9]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-z0-9]+|[A-Z]{2,}|and|or|2\.0)){0,4}\b/g)) {
    candidates.add(cleanConceptLabel(match[0]));
  }
  for (const match of text.matchAll(/\b(?:including|such as|like|covers?|methods? include)\s+([^.;:]{8,180})/gi)) {
    for (const part of match[1].split(/,|\bor\b|\band\b/gi)) {
      candidates.add(cleanConceptLabel(part));
    }
  }
  return [...candidates].filter(Boolean);
}

function addConcept(candidates: Map<string, { label: string; score: number }>, label: string, score: number) {
  const clean = cleanConceptLabel(label);
  if (!clean) return;
  const key = conceptKey(clean);
  const existing = candidates.get(key);
  candidates.set(key, { label: existing?.label ?? clean, score: (existing?.score ?? 0) + score });
}

function cleanConceptLabel(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[^a-z0-9]+|[^a-z0-9)]+$/gi, "")
    .trim()
    .replace(/\bApi\b/g, "API")
    .replace(/\bJwt\b/g, "JWT")
    .replace(/\bOauth\b/g, "OAuth")
    .replace(/\bTls\b/g, "TLS");
}

function conceptKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function usefulConcept(label: string, title: string) {
  const key = conceptKey(label);
  if (key.length < 3 || key.length > 48) return false;
  if (conceptKey(title) === key) return false;
  if (/^(the|this|that|these|those|guide|article|summary|overview|introduction|common|best|key|what|why|how|using|use|uses|used|when|where|which)$/i.test(key)) return false;
  return /[a-z]{3,}|api|jwt|tls|sso|saml|oidc/i.test(label);
}

export function extractFacts(sources: ResearchPack["sources"]): ResearchFactSource[] {
  const seen = new Set<string>();
  const facts: ResearchFactSource[] = [];
  for (const source of sources) {
    const candidates = factCandidatesForSource(source);
    for (const candidate of candidates) {
      const key = factDedupeKey(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push({
        fact: candidate,
        sourceId: source.id,
        sourceUrl: source.url,
        sourceTitle: source.title
      });
      if (facts.length >= 18) return facts;
    }
  }
  return facts;
}

function factCandidatesForSource(source: ResearchPack["sources"][number]) {
  const bits = [
    source.summary,
    ...(source.highlights ?? []),
    source.text
  ].filter(Boolean) as string[];

  return bits
    .flatMap(splitFactCandidates)
    .map(cleanFactCandidate)
    .filter((fact) => usefulFactCandidate(fact))
    .sort((a, b) => factScore(b) - factScore(a))
    .slice(0, 4);
}

function splitFactCandidates(value: string) {
  return value
    .replace(/\r/g, "\n")
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .flatMap((part) => part.split(/\s+-\s+(?=[A-Z0-9])/))
    .map((part) => part.trim());
}

function cleanFactCandidate(value: string) {
  return value
    .replace(/^summary(?:\s+(?:for|tailored to)[^:]+)?\s*:\s*/i, "")
    .replace(/^key (?:content|points|takeaways|steps|sections to explore)\s*:\s*/i, "")
    .replace(/^notes?\s*:\s*/i, "")
    .replace(/^[*-]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function usefulFactCandidate(value: string) {
  if (value.length < 45 || value.length > 360) return false;
  if (/^(what it is|what they do|what it helps with|purpose|useful for)$/i.test(value)) return false;
  if (/^(if you|would you like|i can tailor|start with the news)/i.test(value)) return false;
  return /[a-z]{4,}/i.test(value) && /[.!?]$|:/.test(value);
}

function factScore(value: string) {
  let score = Math.min(value.length, 240);
  if (/\b(must|should|requires?|varies|costs?|standards?|licens|insurance|structural|engineer|compliance|warranty|code|regulation|risk)\b/i.test(value)) score += 80;
  if (/\d/.test(value)) score += 30;
  if (/^(the page|this guide|this article|the guide|summary)/i.test(value)) score -= 40;
  return score;
}

function factDedupeKey(value: string) {
  const words = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 14);
  return words.join(" ");
}

function extractQuestions(sources: ResearchPack["sources"], title: string) {
  const questions = new Set<string>();
  const combined = sources.map((source) => [source.title, source.summary, source.text].join(" ")).join(" ");
  for (const match of combined.matchAll(/([A-Z][^?.!]{12,120}\?)/g)) {
    questions.add(match[1].trim());
    if (questions.size >= 10) return [...questions];
  }
  if (questions.size === 0) {
    questions.add(`What should you know about ${title.toLowerCase()}?`);
    questions.add(`Why does ${title.toLowerCase()} matter?`);
  }
  return [...questions];
}

function extractHeadings(sources: ResearchPack["sources"]) {
  return sources
    .map((source) => source.title)
    .filter(Boolean)
    .slice(0, 12);
}
