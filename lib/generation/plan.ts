import { clampTargetWords } from "@/lib/project/profile";
import type { ContentControls, ProjectProfileSnapshot } from "@/lib/types";

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

export function buildArticleGenerationPlan(controls: ContentControls, profileSnapshot?: ProjectProfileSnapshot | null): ArticleGenerationPlan {
  const targetWords = clampTargetWords(profileSnapshot?.targetWords ?? controls.lengthTargetWords);
  const density = sectionDensityForAudience(profileSnapshot?.audience);
  const h2SectionCount = clamp(Math.round(targetWords / density), 4, 12);
  return {
    targetWords,
    minimumWords: Math.round(targetWords * 0.8),
    maximumWords: Math.round(targetWords * 1.2),
    h2SectionCount,
    wordsPerSection: Math.max(120, Math.round(targetWords / h2SectionCount)),
    maxOutputTokens: clamp(Math.ceil(targetWords * 2), MIN_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS)
  };
}

function sectionDensityForAudience(audience?: string | null) {
  if (audience === "technical_professionals" || audience === "developers" || audience === "procurement_teams") return 320;
  if (audience === "consumers" || audience === "general_audience") return 420;
  if (audience === "executives" || audience === "business_owners") return 390;
  return 350;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
