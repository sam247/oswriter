import type { WorkspacePreferencesDocument } from "@/lib/types";

export function toPublicWorkspacePreferences(preferences: WorkspacePreferencesDocument): WorkspacePreferencesDocument {
  const aiProvider = preferences.aiProvider;
  return {
    ...preferences,
    aiProvider: {
      preference: aiProvider.writerKeyEnabled ? "bring_your_own_key" : "platform_managed",
      personalKeyStatus: aiProvider.writerKeyEnabled ? aiProvider.personalKeyStatus : "not_configured",
      writerKeyEnabled: aiProvider.writerKeyEnabled,
      writerKeyStatus: aiProvider.writerKeyStatus,
      writerApiKey: aiProvider.writerApiKey,
      researchKeyEnabled: false,
      researchKeyStatus: "not_configured",
      researchApiKey: "",
      researchProvider: "queuewrite"
    }
  };
}
