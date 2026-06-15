import type { ResearchPack, SearchAdapter, SearchResult } from "@/lib/types";
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

export async function runResearch(title: string, articleId: string, search: SearchAdapter): Promise<ResearchPack> {
  const started = Date.now();
  const queries = buildQueryVariants(title);
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

  const scored = raw.slice(0, 30).map((result, index) => toResearchSource(result, title, index + 1));
  const accepted = scored
    .filter((source) => source.accepted)
    .sort((a, b) => (b.authorityScore + b.relevanceScore) - (a.authorityScore + a.relevanceScore))
    .slice(0, 12);
  const rejected = scored.filter((source) => !accepted.some((kept) => kept.url === source.url));
  const usefulFacts = extractFacts(accepted);
  const questionsFound = extractQuestions(accepted, title);
  const headingsFound = extractHeadings(accepted);
  const authorityScore = average(accepted.map((source) => source.authorityScore));
  const relevanceScore = average(accepted.map((source) => source.relevanceScore));
  const confidence = Math.round((authorityScore * 0.45) + (relevanceScore * 0.35) + (Math.min(accepted.length, 8) / 8 * 20));
  const warnings: string[] = [];

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
    createdAt: nowIso()
  };
}

function extractFacts(sources: ResearchPack["sources"]) {
  const facts = new Set<string>();
  for (const source of sources) {
    for (const bit of [source.summary, ...source.highlights, source.text?.split(". ").slice(0, 2).join(". ")].filter(Boolean)) {
      const fact = String(bit).replace(/\s+/g, " ").trim();
      if (fact.length > 45 && fact.length < 260) facts.add(fact);
      if (facts.size >= 18) return [...facts];
    }
  }
  return [...facts];
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
