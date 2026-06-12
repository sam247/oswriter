import type { ContentControls, PipelineStep, ProjectDocument, SettingsDocument } from "@/lib/types";

export const DEFAULT_PROJECT_ID = "default";

export const DEFAULT_CONTROLS: ContentControls = {
  includeTldr: false,
  includeFaq: true,
  runEditor: true,
  styleProfile: "technical",
  targetTone: "clear, practical, authoritative",
  lengthTargetWords: 1400
};

export function nowIso() {
  return new Date().toISOString();
}

export function createDefaultProject(): ProjectDocument {
  const now = nowIso();
  return {
    id: DEFAULT_PROJECT_ID,
    name: "Default Project",
    createdAt: now,
    updatedAt: now
  };
}

export function createDefaultSettings(): SettingsDocument {
  return {
    projectId: DEFAULT_PROJECT_ID,
    controls: DEFAULT_CONTROLS,
    staleProcessingMinutes: 15
  };
}

export function createPipeline(): PipelineStep[] {
  return [
    { stage: "research", status: "idle" },
    { stage: "outline", status: "idle" },
    { stage: "generation", status: "idle" },
    { stage: "save", status: "idle" },
    { stage: "editor", status: "idle" },
    { stage: "validation", status: "idle" },
    { stage: "export", status: "idle" }
  ];
}
