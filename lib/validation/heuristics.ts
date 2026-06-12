import type { ValidationInput, ValidationResult } from "@/lib/types";

export function heuristicValidation({ markdown, research }: ValidationInput): ValidationResult {
  const warnings: string[] = [];
  const needsReviewReasons: string[] = [];
  const h2Count = (markdown.match(/^## /gm) ?? []).length;
  const hasFaq = /faq|frequently asked/i.test(markdown);
  const hasLeakage = /according to (the|this) source|research process|sources say/i.test(markdown);
  const wordCount = markdown.trim().split(/\s+/).filter(Boolean).length;

  if (research.warnings.length) {
    warnings.push(...research.warnings);
    needsReviewReasons.push(...research.warnings);
  }
  if (h2Count < 4) {
    warnings.push("Article has fewer than 4 H2 sections.");
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
  if (wordCount < 650) {
    warnings.push("Article is shorter than expected.");
    needsReviewReasons.push("Completeness needs review.");
  }

  const qualityScore = Math.max(35, 100 - warnings.length * 10 - (research.confidence < 60 ? 15 : 0));
  const faqScore = hasFaq ? 80 : 45;
  const seoScore = h2Count >= 4 ? 82 : 55;

  return {
    pass: warnings.length === 0,
    warnings: [...new Set(warnings)],
    needsReviewReasons: [...new Set(needsReviewReasons)],
    qualityScore,
    sectionScores: {
      research: research.confidence,
      intent: 75,
      headings: h2Count >= 4 ? 82 : 50,
      readability: wordCount > 650 ? 78 : 55
    },
    faqScore,
    seoScore
  };
}
