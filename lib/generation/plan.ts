import type { ContentControls } from "@/lib/types";

const MIN_OUTPUT_TOKENS = 3200;
const MAX_OUTPUT_TOKENS = 8000;

export interface ArticleGenerationPlan {
  targetWords: number;
  minimumWords: number;
  maximumWords: number;
  h2SectionCount: number;
  wordsPerSection: number;
  maxOutputTokens: number;
}

export function buildArticleGenerationPlan(controls: ContentControls): ArticleGenerationPlan {
  const targetWords = clamp(Math.round(controls.lengthTargetWords || 1400), 300, 5000);
  const h2SectionCount = clamp(Math.round(targetWords / 350), 4, 12);
  return {
    targetWords,
    minimumWords: Math.round(targetWords * 0.8),
    maximumWords: Math.round(targetWords * 1.2),
    h2SectionCount,
    wordsPerSection: Math.max(120, Math.round(targetWords / h2SectionCount)),
    maxOutputTokens: clamp(Math.ceil(targetWords * 2), MIN_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS)
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
