import { calculateProfileRelevanceScore } from "@/lib/project/profile";
import type { ProjectProfileSnapshot, ResearchFactSource, ResearchPack, SearchAdapter, SearchResult } from "@/lib/types";
import { buildQueryVariants, average, toResearchSource } from "@/lib/research/scoring";
import { nowIso } from "@/lib/defaults";
import { estimateResearchCostUsd } from "@/lib/telemetry/costs";

const EXCLUDE_DOMAINS = [
  "dictionary.com",
  "merriam-webster.com",
  "thesaurus.com",
  "collinsdictionary.com",
  "yourdictionary.com",
  "definitions.net"
];

export async function runResearch(title: string, articleId: string, search: SearchAdapter, profileSnapshot?: ProjectProfileSnapshot | null): Promise<ResearchPack> {
  const started = Date.now();
  const queries = buildQueryVariants(title, profileSnapshot);
  const seen = new Set<string>();
  const raw: SearchResult[] = [];
  const requestIds: string[] = [];

  const responses = await Promise.allSettled(queries.map((query) => search.search(query, {
      numResults: 5,
      excludeDomains: EXCLUDE_DOMAINS
    })));

  const failures = responses.filter((response) => response.status === "rejected");
  const successfulResponses = responses.filter((response) => response.status === "fulfilled").length;
  for (const response of responses) {
    if (response.status === "rejected") continue;
    const { results, requestId } = response.value;
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
    authorityScore,
    relevanceScore,
    confidence,
    warnings,
    requestIds: [...new Set(requestIds)],
    durationMs: Date.now() - started,
    exaSearchCalls: queries.length,
    exaContentCalls: successfulResponses,
    estimatedResearchCostUsd: estimateResearchCostUsd(queries.length, successfulResponses),
    profileSnapshot,
    profileRelevanceScore,
    createdAt: nowIso()
  };
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
