import { buildArticleGenerationPlan, buildPlanningDiagnostics } from "@/lib/generation/plan";
import { calculateProfileRelevanceScore } from "@/lib/project/profile";
import type { ValidationInput, ValidationResult } from "@/lib/types";
import { CONTENT_PROFILES } from "@/lib/content-profiles";

export function heuristicValidation({ markdown, research, controls, targetWords, profileSnapshot, contentProfile = "industry_explainer" }: ValidationInput): ValidationResult {
  const warnings: string[] = [];
  const advisories: string[] = [];
  const needsReviewReasons: string[] = [];
  const h2Count = (markdown.match(/^## /gm) ?? []).length;
  const hasFaq = /faq|frequently asked/i.test(markdown);
  const hasLeakage = /according to (the|this) source|research process|sources say/i.test(markdown);
  const wordCount = markdown.trim().split(/\s+/).filter(Boolean).length;
  const plan = controls ? buildArticleGenerationPlan(controls, profileSnapshot, null, contentProfile) : null;
  const contentDefinition = CONTENT_PROFILES[contentProfile];
  const effectiveTargetWords = targetWords ?? plan?.targetWords ?? null;
  const minimumWords = effectiveTargetWords ? Math.round(effectiveTargetWords * 0.8) : 650;
  const expectedH2Count = plan?.h2SectionCount ?? 4;
  const planningDiagnostics = plan ? buildPlanningDiagnostics(plan, markdown, research) : null;

  if (research.warnings.length) {
    warnings.push(...research.warnings);
    needsReviewReasons.push(...research.warnings);
  }
  if (h2Count < expectedH2Count) {
    warnings.push(`Article has fewer than ${expectedH2Count} H2 sections.`);
    needsReviewReasons.push("Heading structure may be thin.");
  }
  if (!hasFaq) {
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
      ...(profileRelevanceScore === null ? {} : { profileRelevance: profileRelevanceScore })
    },
    profileRelevanceScore,
    faqScore,
    seoScore
  };
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
