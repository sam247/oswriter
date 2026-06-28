import { buildArticleGenerationPlan, buildPlanningDiagnostics } from "@/lib/generation/plan";
import { businessCoverageItems, calculateKnowledgeCoverage, semanticCoverageItems } from "@/lib/knowledge-engine";
import { calculateProfileRelevanceScore } from "@/lib/project/profile";
import type { ValidationInput, ValidationResult } from "@/lib/types";
import { CONTENT_PROFILES } from "@/lib/content-profiles";

export function heuristicValidation({ title, markdown, research, controls, targetWords, profileSnapshot, siteProfile, semanticIntelligence, contentProfile = "industry_explainer" }: ValidationInput): ValidationResult {
  const warnings: string[] = [];
  const advisories: string[] = [];
  const needsReviewReasons: string[] = [];
  const h2Count = (markdown.match(/^## /gm) ?? []).length;
  const hasFaq = /faq|frequently asked/i.test(markdown);
  const hasLeakage = /according to (the|this) source|research process|sources say/i.test(markdown);
  const hasPracticalExample = /^##\s+.*(?:Example|Case Study)\b/im.test(markdown) || /^Example:\s+/im.test(markdown);
  const hasStatistic = /(?:\d+(?:\.\d+)?\s?%|\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s?(?:million|billion|survey|respondents|companies|organizations|organisations|customers|users|workers|projects|market|revenue|cost|growth)\b)/i.test(markdown);
  const hasInternalLink = /\[[^\]]+\]\((?!https?:\/\/)[^)]+\)/i.test(markdown);
  const wordCount = markdown.trim().split(/\s+/).filter(Boolean).length;
  const plan = controls ? buildArticleGenerationPlan(controls, profileSnapshot, siteProfile, contentProfile, title, semanticIntelligence ?? research.semanticIntelligence) : null;
  const contentDefinition = CONTENT_PROFILES[contentProfile];
  const effectiveTargetWords = targetWords ?? plan?.targetWords ?? null;
  const minimumWords = effectiveTargetWords ? Math.round(effectiveTargetWords * 0.8) : 650;
  const expectedH2Count = plan?.h2SectionCount ?? 4;
  const planningDiagnostics = plan ? buildPlanningDiagnostics(plan, markdown, research) : null;
  const editorialStandards = new Set(profileSnapshot?.editorialStandards ?? []);
  const businessCoverage = calculateKnowledgeCoverage(markdown, businessCoverageItems(siteProfile?.businessIntelligence), "Business opportunity");
  const semanticCoverage = calculateKnowledgeCoverage(markdown, semanticCoverageItems(semanticIntelligence ?? research.semanticIntelligence), "Semantic opportunity");

  if (research.warnings.length) {
    warnings.push(...research.warnings);
    needsReviewReasons.push(...research.warnings);
  }
  if (h2Count < expectedH2Count) {
    warnings.push(`Article has fewer than ${expectedH2Count} H2 sections.`);
    needsReviewReasons.push("Heading structure may be thin.");
  }
  if ((controls?.includeFaq ?? false) || editorialStandards.has("include_faqs")) {
    if (!hasFaq) {
      warnings.push("FAQ section missing or not clearly labelled.");
      needsReviewReasons.push("FAQ quality needs review.");
    }
  } else if (!hasFaq) {
    warnings.push("FAQ section missing or not clearly labelled.");
    needsReviewReasons.push("FAQ quality needs review.");
  }
  if (hasLeakage) {
    warnings.push("Article may contain source or research-process language.");
    needsReviewReasons.push("Research leakage needs review.");
  }
  if (wordCount < minimumWords) {
    warnings.push(effectiveTargetWords ? `Article is below 80% of the ${effectiveTargetWords}-word target.` : "Article is shorter than expected.");
    needsReviewReasons.push("Completeness needs review.");
  }
  if (editorialStandards.has("practical_examples") && !hasPracticalExample) {
    warnings.push("Editorial standards call for practical examples, but none were detected.");
    needsReviewReasons.push("Practical examples need review.");
  }
  if (editorialStandards.has("cite_statistics") && research.usefulFacts.some(isStatisticLike) && !hasStatistic) {
    warnings.push("Editorial standards call for supported statistics where relevant, but none were detected.");
    needsReviewReasons.push("Evidence usage needs review.");
  }
  if (editorialStandards.has("include_internal_links") && !hasInternalLink) {
    advisories.push("Internal linking opportunity may be missing.");
  }
  const missingProfileRequirements = profileRequirementWarnings(contentProfile, markdown);
  for (const warning of missingProfileRequirements) {
    warnings.push(warning);
    needsReviewReasons.push(`${contentDefinition.label} format needs review.`);
  }
  if (
    planningDiagnostics
    && planningDiagnostics.researchConceptCount >= 4
    && planningDiagnostics.actualBreadthCoveragePercent < 60
  ) {
    advisories.push("Topic breadth may be underrepresented.");
  }
  if (businessCoverage.available.length >= 3 && businessCoverage.used.length === 0) {
    advisories.push("Available business authority, trust, or expertise signals were not used.");
  } else if (businessCoverage.missing.length >= 3 && businessCoverage.used.length > 0) {
    advisories.push("Additional business evidence could be referenced if it fits the article naturally.");
  }
  if (semanticCoverage.available.length >= 8 && semanticCoverage.missing.length >= 5) {
    advisories.push("Semantic coverage could be expanded with missing concepts rather than repeated keywords.");
  }

  const qualityScore = Math.max(35, 100 - warnings.length * 10 - (research.confidence < 60 ? 15 : 0));
  const faqScore = hasFaq ? 80 : 45;
  const seoScore = h2Count >= 4 ? 82 : 55;
  const profileRelevanceScore = calculateProfileRelevanceScore({ snapshot: profileSnapshot, research, markdown });

  return {
    pass: warnings.length === 0,
    warnings: [...new Set(warnings)],
    advisories: [...new Set(advisories)],
    needsReviewReasons: [...new Set(needsReviewReasons)],
    qualityScore,
    sectionScores: {
      research: research.confidence,
      intent: 75,
      headings: h2Count >= expectedH2Count ? 82 : 50,
      readability: wordCount >= minimumWords ? 78 : 55,
      ...(businessCoverage.available.length ? { businessCoverage: Math.round((businessCoverage.used.length / businessCoverage.available.length) * 100) } : {}),
      ...(semanticCoverage.available.length ? { semanticCoverage: Math.round((semanticCoverage.used.length / semanticCoverage.available.length) * 100) } : {}),
      ...(profileRelevanceScore === null ? {} : { profileRelevance: profileRelevanceScore })
    },
    profileRelevanceScore,
    businessCoverage,
    semanticCoverage,
    faqScore,
    seoScore
  };
}

function isStatisticLike(value: string) {
  return /(?:\d+(?:\.\d+)?\s?%|\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s?(?:million|billion|survey|respondents|companies|organizations|organisations|customers|users|workers|projects|market|revenue|cost|growth)\b)/i.test(value);
}

function profileRequirementWarnings(profile: ValidationInput["contentProfile"], markdown: string) {
  const normalized = markdown.toLowerCase();
  const has = (patterns: string[]) => patterns.some((pattern) => normalized.includes(pattern));
  const warnings: string[] = [];
  if (profile === "comparison" || profile === "best_of") {
    if (!has(["strengths", "pros"]) || !has(["weaknesses", "cons", "limitations"])) warnings.push("Profile requires explicit strengths and weaknesses.");
    if (!has(["recommendation", "who should choose", "best for"])) warnings.push("Profile requires a qualified recommendation section.");
  }
  if (profile === "best_of" && !has(["comparison table", "| feature", "| product"])) warnings.push("Best Of profile requires a comparison table.");
  if (profile === "buying_guide" && !has(["budget", "cost"])) warnings.push("Buying Guide profile requires budget or cost factors.");
  if (profile === "how_to") {
    const steps = (markdown.match(/^##+\s+(?:step\s+\d+|\d+[.)])/gim) ?? []).length;
    if (steps < 3) warnings.push("How-To profile requires at least three clearly ordered steps.");
    if (!has(["prerequisite", "before you begin", "what you need"])) warnings.push("How-To profile requires prerequisites.");
  }
  if (profile === "industry_explainer" && !has(["what is", "definition", "refers to", "means"])) warnings.push("Industry Explainer profile requires a clear definition.");
  if (["white_paper", "industry_report", "market_analysis", "research_report"].includes(profile ?? "") && !has(["executive summary", "abstract"])) warnings.push("Research profile requires an executive summary or abstract.");
  return warnings;
}
