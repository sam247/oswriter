import type { ArticleDocument, ResearchPack } from "@/lib/types";

type ScoreKey = "quality" | "research" | "evidence";

export interface ScoreComponent {
  key: string;
  label: string;
  weight: number;
  value: number;
  contribution: number;
  description: string;
}

export interface ScoreProfileItem {
  label: string;
  value: string | number;
}

export interface ArticleScore {
  key: ScoreKey;
  label: string;
  score: number;
  tooltip: string;
  components: ScoreComponent[];
  profile: ScoreProfileItem[];
  notMeasured?: ScoreProfileItem[];
}

export interface ArticleScores {
  quality: ArticleScore;
  research: ArticleScore;
  evidence: ArticleScore;
}

export const ARTICLE_SCORE_WEIGHTS = {
  quality: {
    validationOutcome: 0.28,
    structureQuality: 0.18,
    readabilityCompleteness: 0.16,
    researchCoverage: 0.12,
    evidenceSupport: 0.12,
    editorialChecks: 0.08,
    sourceUtilisation: 0.06
  },
  research: {
    sourceCount: 0.18,
    sourceDiversity: 0.17,
    averageAuthority: 0.16,
    highestAuthority: 0.1,
    researchConfidence: 0.18,
    extractedFacts: 0.12,
    authorityDistribution: 0.09
  },
  evidence: {
    validationSupport: 0.3,
    sourceSupport: 0.22,
    factSupport: 0.16,
    citationCoverage: 0.14,
    reviewStatus: 0.12,
    inlineEvidence: 0.06
  }
} as const;

export const SCORE_TOOLTIPS = {
  quality: "Overall article quality based on research, structure, validation and editorial checks.",
  research: "Measures the strength and breadth of the research used to generate this article.",
  evidence: "Measures how well claims in the article are supported by sources and validation checks."
} as const;

export function calculateArticleScores(article: ArticleDocument, research?: ResearchPack | null): ArticleScores {
  const researchScore = calculateResearchScore(article, research);
  const evidenceScore = calculateEvidenceScore(article, research);
  const qualityScore = calculateQualityScore(article, researchScore.score, evidenceScore.score);
  return {
    quality: qualityScore,
    research: researchScore,
    evidence: evidenceScore
  };
}

export function averageArticleScores(scores: ArticleScores[]) {
  return {
    quality: average(scores.map((item) => item.quality.score)),
    research: average(scores.map((item) => item.research.score)),
    evidence: average(scores.map((item) => item.evidence.score))
  };
}

function calculateQualityScore(article: ArticleDocument, researchScore: number, evidenceScore: number): ArticleScore {
  const h2Count = countMatches(article.markdown, /^##\s+/gm);
  const h3Count = countMatches(article.markdown, /^###\s+/gm);
  const hasFaq = /^##\s+FAQ\b/im.test(article.markdown) || /frequently asked/i.test(article.markdown);
  const warningCount = article.validation.warnings.length;
  const reviewCount = article.needsReviewReasons.length;
  const wordCount = article.wordCount;
  const targetWords = article.targetWords ?? 1400;
  const idealMinWords = Math.round(targetWords * 0.85);
  const idealMaxWords = Math.round(targetWords * 1.15);
  const floorMinWords = Math.round(targetWords * 0.45);
  const floorMaxWords = Math.round(targetWords * 1.5);
  const structureQuality = clamp(Math.round((Math.min(h2Count, 6) / 6) * 70 + (Math.min(h3Count, 8) / 8) * 15 + (hasFaq ? 15 : 0)));
  const readabilityCompleteness = scoreRange(wordCount, idealMinWords, idealMaxWords, floorMinWords, floorMaxWords);
  const editorialChecks = clamp(100 - warningCount * 14 - reviewCount * 10 - (article.status === "needs_review" ? 10 : 0));
  const sourceUtilisation = clamp(Math.round((Math.min(article.sources.length, 12) / 12) * 100));
  const components = weightedComponents(ARTICLE_SCORE_WEIGHTS.quality, {
    validationOutcome: {
      label: "Validation outcome",
      value: article.validation.qualityScore,
      description: "Final validation quality score recorded for the article."
    },
    structureQuality: {
      label: "Structure quality",
      value: structureQuality,
      description: "Heading depth, section count, and FAQ structure."
    },
    readabilityCompleteness: {
      label: "Readability/completeness",
      value: readabilityCompleteness,
      description: "Word-count completeness against the expected article range."
    },
    researchCoverage: {
      label: "Research coverage",
      value: researchScore,
      description: "Computed research strength contribution."
    },
    evidenceSupport: {
      label: "Evidence support",
      value: evidenceScore,
      description: "Computed evidence support contribution."
    },
    editorialChecks: {
      label: "Editorial checks",
      value: editorialChecks,
      description: "Warnings, review status, and editorial review reasons."
    },
    sourceUtilisation: {
      label: "Source utilisation",
      value: sourceUtilisation,
      description: "How fully the expected source set is represented."
    }
  });
  return {
    key: "quality",
    label: "Quality",
    score: scoreFromComponents(components),
    tooltip: SCORE_TOOLTIPS.quality,
    components,
    profile: [
      { label: "Validation", value: article.validation.qualityScore },
      { label: "Structure", value: structureQuality },
      { label: "Readability", value: readabilityCompleteness },
      { label: "Warnings", value: warningCount },
      { label: "Review status", value: article.status === "needs_review" ? "Needs review" : "Clear" }
    ]
  };
}

function calculateResearchScore(article: ArticleDocument, research?: ResearchPack | null): ArticleScore {
  const uniqueDomains = new Set(article.sources.map((source) => source.domain).filter(Boolean)).size;
  const sourceCount = article.sources.length;
  const authorityScores = article.sources.map((source) => source.authorityScore);
  const averageAuthority = average(authorityScores);
  const highestAuthority = authorityScores.length ? Math.max(...authorityScores) : 0;
  const highAuthorityShare = sourceCount ? Math.round((article.sources.filter((source) => source.authorityScore >= 78).length / sourceCount) * 100) : 0;
  const researchConfidence = research?.confidence ?? estimateResearchConfidence(article);
  const factCount = research?.usefulFacts.length ?? Math.min(sourceCount * 2, 12);
  const sourceCountScore = clamp(Math.round((Math.min(sourceCount, 12) / 12) * 100));
  const diversityScore = clamp(Math.round((Math.min(uniqueDomains, 8) / 8) * 100));
  const factsScore = clamp(Math.round((Math.min(factCount, 16) / 16) * 100));
  const components = weightedComponents(ARTICLE_SCORE_WEIGHTS.research, {
    sourceCount: {
      label: "Source count",
      value: sourceCountScore,
      description: "Accepted source volume, capped at 12 sources."
    },
    sourceDiversity: {
      label: "Source diversity",
      value: diversityScore,
      description: "Unique accepted domains, capped at 8 domains."
    },
    averageAuthority: {
      label: "Average authority",
      value: averageAuthority,
      description: "Mean heuristic authority across accepted sources."
    },
    highestAuthority: {
      label: "Highest authority",
      value: highestAuthority,
      description: "Strongest accepted source authority signal."
    },
    researchConfidence: {
      label: "Research confidence",
      value: researchConfidence,
      description: "Research engine confidence, or a fallback estimate from source profile."
    },
    extractedFacts: {
      label: "Extracted facts",
      value: factsScore,
      description: "Useful facts extracted from accepted sources."
    },
    authorityDistribution: {
      label: "Authority distribution",
      value: highAuthorityShare,
      description: "Share of accepted sources at authority 78 or above."
    }
  });
  const coverage = clamp(Math.round(sourceCountScore * 0.45 + diversityScore * 0.3 + factsScore * 0.25));
  return {
    key: "research",
    label: "Research",
    score: scoreFromComponents(components),
    tooltip: SCORE_TOOLTIPS.research,
    components,
    profile: [
      { label: "Sources", value: sourceCount },
      { label: "Unique domains", value: uniqueDomains },
      { label: "Average authority", value: averageAuthority },
      { label: "Highest authority", value: highestAuthority },
      { label: "Coverage", value: `${coverage}%` },
      { label: "Research depth", value: depthLabel(coverage) }
    ]
  };
}

function calculateEvidenceScore(article: ArticleDocument, research?: ResearchPack | null): ArticleScore {
  const sourceCount = article.sources.length;
  const warningCount = article.validation.warnings.length;
  const reviewCount = article.needsReviewReasons.length;
  const inlineLinks = countMatches(article.markdown, /\[[^\]]+\]\([^)]+\)/g);
  const factCount = research?.usefulFacts.length ?? Math.min(sourceCount * 2, 12);
  const validationSupport = clamp(100 - warningCount * 16 - reviewCount * 9 - (article.status === "needs_review" ? 8 : 0));
  const sourceSupport = clamp(Math.round((Math.min(sourceCount, 12) / 12) * 100));
  const factSupport = clamp(Math.round((Math.min(factCount, 16) / 16) * 100));
  const citationCoverage = clamp(Math.round((Math.min(sourceCount, 12) / 12) * 100));
  const reviewStatus = clamp(100 - reviewCount * 14 - (article.status === "needs_review" ? 16 : 0));
  const inlineEvidence = inlineLinks ? clamp(Math.round((Math.min(inlineLinks, 6) / 6) * 100)) : 55;
  const components = weightedComponents(ARTICLE_SCORE_WEIGHTS.evidence, {
    validationSupport: {
      label: "Validation support",
      value: validationSupport,
      description: "Validation pass, warnings, and review reasons."
    },
    sourceSupport: {
      label: "Source support",
      value: sourceSupport,
      description: "Accepted source count available to support the article."
    },
    factSupport: {
      label: "Fact support",
      value: factSupport,
      description: "Useful extracted facts available as support material."
    },
    citationCoverage: {
      label: "Citation coverage",
      value: citationCoverage,
      description: "Accepted sources available for citation coverage."
    },
    reviewStatus: {
      label: "Review status",
      value: reviewStatus,
      description: "Penalty for active review reasons."
    },
    inlineEvidence: {
      label: "Inline evidence",
      value: inlineEvidence,
      description: "Markdown links or inline evidence markers present in the final draft."
    }
  });
  const evidenceCoverage = scoreFromComponents(components);
  return {
    key: "evidence",
    label: "Evidence",
    score: evidenceCoverage,
    tooltip: SCORE_TOOLTIPS.evidence,
    components,
    profile: [
      { label: "Citations", value: sourceCount },
      { label: "Unsupported claims", value: "Not measured" },
      { label: "Validation warnings", value: warningCount },
      { label: "Contradictions detected", value: "Not measured" },
      { label: "Evidence coverage", value: `${evidenceCoverage}%` }
    ],
    notMeasured: [
      { label: "Unsupported claims", value: "Not measured" },
      { label: "Contradictions detected", value: "Not measured" }
    ]
  };
}

function weightedComponents<T extends Record<string, number>>(
  weights: T,
  factors: Record<keyof T, { label: string; value: number; description: string }>
) {
  return Object.entries(weights).map(([key, weight]) => {
    const factor = factors[key as keyof T];
    const value = clamp(factor.value);
    return {
      key,
      label: factor.label,
      weight: Number(weight),
      value,
      contribution: value * Number(weight),
      description: factor.description
    };
  });
}

function scoreFromComponents(components: ScoreComponent[]) {
  return clamp(Math.round(components.reduce((sum, component) => sum + component.contribution, 0)));
}

function estimateResearchConfidence(article: ArticleDocument) {
  const authority = average(article.sources.map((source) => source.authorityScore));
  const relevance = average(article.sources.map((source) => source.relevanceScore));
  const count = Math.min(article.sources.length, 8) / 8 * 20;
  return clamp(Math.round(authority * 0.45 + relevance * 0.35 + count));
}

function scoreRange(value: number, idealMin: number, idealMax: number, floorMin: number, floorMax: number) {
  if (value >= idealMin && value <= idealMax) return 100;
  if (value < idealMin) return clamp(Math.round(((value - floorMin) / (idealMin - floorMin)) * 45 + 55));
  return clamp(Math.round(((floorMax - value) / (floorMax - idealMax)) * 35 + 65));
}

function depthLabel(score: number) {
  if (score >= 85) return "High";
  if (score >= 65) return "Moderate";
  return "Light";
}

function countMatches(value: string, pattern: RegExp) {
  return (value.match(pattern) ?? []).length;
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
