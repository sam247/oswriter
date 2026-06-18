import type { ContentControls, PipelineStep, ProjectDocument, QueueControlDocument, SettingsDocument, WorkspacePreferencesDocument } from "@/lib/types";
import { createDefaultProjectProfile } from "@/lib/project/profile";
import { EMPTY_PROJECT_KNOWLEDGE_BASE } from "@/lib/project/knowledge-base";

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
    profile: createDefaultProjectProfile(DEFAULT_CONTROLS.lengthTargetWords),
    knowledgeBase: EMPTY_PROJECT_KNOWLEDGE_BASE,
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

export function createDefaultQueueControl(projectId = DEFAULT_PROJECT_ID): QueueControlDocument {
  return {
    projectId,
    mode: "stopped",
    requestedBy: null,
    requestedAt: null,
    stoppedAt: nowIso(),
    reason: "Waiting for generation start.",
    updatedAt: nowIso()
  };
}

export function createDefaultWorkspacePreferences(input: Partial<WorkspacePreferencesDocument["account"]> = {}): WorkspacePreferencesDocument {
  const now = nowIso();
  return {
    account: {
      name: input.name ?? "",
      email: input.email ?? "",
      workspaceName: input.workspaceName ?? "Default Workspace"
    },
    notifications: {
      enabled: true,
      queueCompleted: true,
      queueCompletedWithWarnings: true,
      queueFailed: true,
      dailySummaryEmail: false,
      weeklySummaryEmail: false
    },
    aiProvider: {
      preference: "platform_managed",
      personalKeyStatus: "not_configured",
      writerKeyEnabled: false,
      writerKeyStatus: "not_configured",
      writerApiKey: "",
      researchKeyEnabled: false,
      researchKeyStatus: "not_configured",
      researchApiKey: ""
    },
    operational: {
      autoStartQueueOnAdd: false,
      confirmBeforeDeletingArticles: true,
      confirmBeforeDeletingProjects: true,
      defaultTargetWordCount: DEFAULT_CONTROLS.lengthTargetWords,
      reuseProjectResearch: false,
      reuseTitleResearch: false
    },
    createdAt: now,
    updatedAt: now
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
