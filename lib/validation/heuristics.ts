import { buildArticleGenerationPlan, buildPlanningDiagnostics } from "@/lib/generation/plan";
import { calculateProfileRelevanceScore } from "@/lib/project/profile";
import type { ValidationInput, ValidationResult } from "@/lib/types";

export function heuristicValidation({ markdown, research, controls, targetWords, profileSnapshot }: ValidationInput): ValidationResult {
  const warnings: string[] = [];
  const advisories: string[] = [];
  const needsReviewReasons: string[] = [];
  const h2Count = (markdown.match(/^## /gm) ?? []).length;
  const hasFaq = /faq|frequently asked/i.test(markdown);
  const hasLeakage = /according to (the|this) source|research process|sources say/i.test(markdown);
  const wordCount = markdown.trim().split(/\s+/).filter(Boolean).length;
  const plan = controls ? buildArticleGenerationPlan(controls, profileSnapshot) : null;
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
