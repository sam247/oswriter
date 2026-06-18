import { clampTargetWords, planningPrioritiesForProfile } from "@/lib/project/profile";
import { knowledgeBasePlanningPriorities, projectKnowledgeContextLines } from "@/lib/project/knowledge-base";
import type { ContentControls, ProjectKnowledgeBase, ProjectProfileSnapshot, ResearchPack } from "@/lib/types";

const MIN_OUTPUT_TOKENS = 3200;
const MAX_OUTPUT_TOKENS = 8000;
export type ExpectedDepth = "light" | "standard" | "deep" | "reference";
export type PlannerOutcome = "matched_plan" | "under_depth" | "over_depth" | "under_target" | "over_target";
export type BreadthStatus = "sufficient" | "underplanned" | "undercovered";

export interface ArticleGenerationPlan {
  targetWords: number;
  minimumWords: number;
  maximumWords: number;
  h2SectionCount: number;
  h3SectionCount: number;
  expectedDepth: ExpectedDepth;
  wordsPerSection: number;
  maxOutputTokens: number;
  planningPriorities: string[];
  knowledgeContext?: string[];
}

export interface PlanningDiagnostics {
  plannedH2Count: number;
  plannedH3Count: number;
  expectedDepth: ExpectedDepth;
  actualH2Count: number;
  actualH3Count: number;
  actualDepth: ExpectedDepth;
  h2AchievementPercent: number;
  h3AchievementPercent: number;
  targetAchievementPercent: number;
  plannerOutcome: PlannerOutcome;
  researchConceptCount: number;
  researchConcepts: string[];
  plannedBreadthRatio: number;
  actualBreadthCoverage: number;
  actualBreadthCoveragePercent: number;
  breadthStatus: BreadthStatus;
}

export function buildArticleGenerationPlan(controls: ContentControls, profileSnapshot?: ProjectProfileSnapshot | null, knowledgeBase?: ProjectKnowledgeBase | null): ArticleGenerationPlan {
  const targetWords = clampTargetWords(profileSnapshot?.targetWords ?? controls.lengthTargetWords);
  const density = sectionDensityForAudience(profileSnapshot?.audience);
  const h2SectionCount = clamp(Math.round(targetWords / density), 4, 12);
  const expectedDepth = expectedDepthForProfile(profileSnapshot, targetWords);
  const h3SectionCount = plannedH3CountForDepth(h2SectionCount, expectedDepth);
  const knowledgeContext = projectKnowledgeContextLines(knowledgeBase);
  return {
    targetWords,
    minimumWords: Math.round(targetWords * 0.8),
    maximumWords: Math.round(targetWords * 1.2),
    h2SectionCount,
    h3SectionCount,
    expectedDepth,
    wordsPerSection: Math.max(120, Math.round(targetWords / h2SectionCount)),
    maxOutputTokens: clamp(Math.ceil(targetWords * 2), MIN_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS),
    planningPriorities: [...planningPrioritiesForProfile(profileSnapshot), ...knowledgeBasePlanningPriorities(knowledgeBase)],
    ...(knowledgeContext.length ? { knowledgeContext } : {})
  };
}

export function buildPlanningDiagnostics(plan: ArticleGenerationPlan, markdown: string, research?: Pick<ResearchPack, "researchConcepts" | "researchConceptCount"> | null): PlanningDiagnostics {
  const actualH2Count = countMatches(markdown, /^##\s+/gm);
  const actualH3Count = countMatches(markdown, /^###\s+/gm);
  const actualWords = countWords(markdown);
  const h2AchievementPercent = percent(actualH2Count, plan.h2SectionCount);
  const h3AchievementPercent = plan.h3SectionCount === 0 ? (actualH3Count === 0 ? 100 : 200) : percent(actualH3Count, plan.h3SectionCount);
  const targetAchievementPercent = percent(actualWords, plan.targetWords);
  const actualDepth = actualDepthFromStructure(actualH2Count, actualH3Count);
  const researchConcepts = (research?.researchConcepts ?? []).slice(0, 20);
  const researchConceptCount = research?.researchConceptCount ?? researchConcepts.length;
  const plannedBreadthRatio = ratio(plan.h2SectionCount, researchConceptCount);
  const actualBreadthCoverage = countCoveredConcepts(markdown, researchConcepts);
  const actualBreadthCoveragePercent = percent(actualBreadthCoverage, researchConceptCount);
  return {
    plannedH2Count: plan.h2SectionCount,
    plannedH3Count: plan.h3SectionCount,
    expectedDepth: plan.expectedDepth,
    actualH2Count,
    actualH3Count,
    actualDepth,
    h2AchievementPercent,
    h3AchievementPercent,
    targetAchievementPercent,
    plannerOutcome: plannerOutcome({ h2AchievementPercent, h3AchievementPercent, targetAchievementPercent }),
    researchConceptCount,
    researchConcepts,
    plannedBreadthRatio,
    actualBreadthCoverage,
    actualBreadthCoveragePercent,
    breadthStatus: breadthStatus({ researchConceptCount, plannedBreadthRatio, actualBreadthCoveragePercent })
  };
}

function sectionDensityForAudience(audience?: string | null) {
  if (["developers", "engineering_managers", "procurement_teams", "project_managers", "site_managers", "security_managers"].includes(audience ?? "")) return 320;
  if (audience === "general_audience") return 420;
  if (["ctos", "cisos", "business_leaders", "business_owners", "healthcare_leaders"].includes(audience ?? "")) return 390;
  return 350;
}

function expectedDepthForProfile(profileSnapshot: ProjectProfileSnapshot | null | undefined, targetWords: number): ExpectedDepth {
  const audience = profileSnapshot?.audience;
  const industry = profileSnapshot?.industry;
  if (targetWords >= 4000) return "reference";
  if (["developers", "engineering_managers", "security_managers"].includes(audience ?? "")) return targetWords >= 3000 ? "reference" : "deep";
  if (audience === "procurement_teams") return "deep";
  if (industry === "cyber_security" || industry === "healthcare" || industry === "finance") return "deep";
  if (["ctos", "cisos", "business_leaders", "business_owners", "healthcare_leaders"].includes(audience ?? "")) return "standard";
  if (audience === "general_audience") return targetWords <= 1200 ? "light" : "standard";
  return targetWords <= 1000 ? "light" : "standard";
}

function plannedH3CountForDepth(h2Count: number, depth: ExpectedDepth) {
  if (depth === "light") return 0;
  if (depth === "standard") return Math.round(h2Count * 0.75);
  if (depth === "deep") return h2Count * 2;
  return h2Count * 3;
}

function actualDepthFromStructure(h2Count: number, h3Count: number): ExpectedDepth {
  if (h2Count <= 0) return "light";
  const h3PerH2 = h3Count / h2Count;
  if (h3PerH2 >= 2.5) return "reference";
  if (h3PerH2 >= 1.5) return "deep";
  if (h3PerH2 >= 0.35) return "standard";
  return "light";
}

function plannerOutcome({
  h2AchievementPercent,
  h3AchievementPercent,
  targetAchievementPercent
}: {
  h2AchievementPercent: number;
  h3AchievementPercent: number;
  targetAchievementPercent: number;
}): PlannerOutcome {
  if (h2AchievementPercent < 80 || h3AchievementPercent < 80) return "under_depth";
  if (h2AchievementPercent > 125 || h3AchievementPercent > 125) return "over_depth";
  if (targetAchievementPercent < 80) return "under_target";
  if (targetAchievementPercent > 110) return "over_target";
  return "matched_plan";
}

function countWords(markdown: string) {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

function countMatches(text: string, pattern: RegExp) {
  return (text.match(pattern) ?? []).length;
}

function percent(actual: number, planned: number) {
  if (planned <= 0) return actual > 0 ? 200 : 100;
  return Math.round((actual / planned) * 1000) / 10;
}

function ratio(actual: number, planned: number) {
  if (planned <= 0) return actual > 0 ? 1 : 0;
  return Math.round((actual / planned) * 100) / 100;
}

function countCoveredConcepts(markdown: string, concepts: string[]) {
  const text = normalizeForMatch(markdown);
  return concepts.filter((concept) => conceptCovered(text, concept)).length;
}

function conceptCovered(normalizedMarkdown: string, concept: string) {
  const normalizedConcept = normalizeForMatch(concept);
  if (!normalizedConcept) return false;
  if (normalizedMarkdown.includes(normalizedConcept)) return true;
  const tokens = normalizedConcept.split(" ").filter((token) => token.length > 2);
  if (tokens.length <= 1) return false;
  return tokens.every((token) => normalizedMarkdown.includes(token));
}

function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function breadthStatus({
  researchConceptCount,
  plannedBreadthRatio,
  actualBreadthCoveragePercent
}: {
  researchConceptCount: number;
  plannedBreadthRatio: number;
  actualBreadthCoveragePercent: number;
}): BreadthStatus {
  if (researchConceptCount < 4) return "sufficient";
  if (plannedBreadthRatio < 0.75) return "underplanned";
  if (actualBreadthCoveragePercent < 60) return "undercovered";
  return "sufficient";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
