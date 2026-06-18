import type { GenerationTelemetryDocument } from "@/lib/types";

export type QualityBand = "Excellent" | "Good" | "Acceptable" | "Weak" | "Poor";

type QualityTelemetry = Pick<GenerationTelemetryDocument,
  | "targetAchievementPercent"
  | "plannedH2Count"
  | "actualH2Count"
  | "plannedH3Count"
  | "actualH3Count"
  | "actualBreadthCoveragePercent"
  | "plannerOutcome"
  | "breadthStatus"
  | "researchConceptCount"
  | "sourcesAccepted"
>;

export interface TelemetryQualityResult {
  qualityScore: number;
  qualityBand: QualityBand;
  components: {
    target: number;
    h2: number;
    h3: number;
    breadth: number;
    depth: number;
    research: number;
  };
}

export function calculateTelemetryQuality(telemetry: QualityTelemetry): TelemetryQualityResult {
  const components = {
    target: targetScore(telemetry.targetAchievementPercent ?? 0),
    h2: structureScore(telemetry.actualH2Count ?? 0, telemetry.plannedH2Count ?? 0),
    h3: h3Score(telemetry.actualH3Count ?? 0, telemetry.plannedH3Count ?? 0),
    breadth: clampScore(telemetry.actualBreadthCoveragePercent ?? 0),
    depth: depthScore(telemetry.plannerOutcome, telemetry.breadthStatus),
    research: researchScore(telemetry.researchConceptCount ?? 0, telemetry.sourcesAccepted)
  };
  const qualityScore = clampScore(Math.round(
    components.target * 0.25
    + components.h2 * 0.20
    + components.h3 * 0.15
    + components.breadth * 0.20
    + components.depth * 0.10
    + components.research * 0.10
  ));
  return { qualityScore, qualityBand: qualityBandFor(qualityScore), components };
}

export function qualityBandFor(score: number): QualityBand {
  const normalized = clampScore(Math.round(score));
  if (normalized >= 90) return "Excellent";
  if (normalized >= 80) return "Good";
  if (normalized >= 70) return "Acceptable";
  if (normalized >= 60) return "Weak";
  return "Poor";
}

function targetScore(achievement: number) {
  if (achievement >= 95 && achievement <= 115) return 100;
  if (achievement < 95) return clampScore(achievement / 95 * 100);
  return clampScore(100 - (achievement - 115) * 2);
}

function structureScore(actual: number, planned: number) {
  if (planned <= 0) return actual <= 0 ? 100 : 90;
  return clampScore(actual / planned * 100);
}

function h3Score(actual: number, planned: number) {
  if (planned <= 0) return 100;
  return structureScore(actual, planned);
}

function depthScore(outcome: string | null | undefined, breadthStatus: string | null | undefined) {
  if (breadthStatus === "underplanned") return 60;
  return ({ matched_plan: 100, under_depth: 70, over_depth: 90, underplanned: 60 } as Record<string, number>)[outcome ?? ""] ?? 70;
}

function researchScore(concepts: number, sources: number) {
  const conceptScore = Math.min(50, Math.max(0, concepts) * 2.5);
  const sourceScore = Math.min(50, Math.max(0, sources) * 5);
  return clampScore(conceptScore + sourceScore);
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
