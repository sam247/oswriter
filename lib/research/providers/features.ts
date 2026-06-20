import type { WorkspacePreferencesDocument } from "@/lib/types";

export function isFirecrawlProviderEnabled() {
  return process.env.ENABLE_FIRECRAWL_PROVIDER === "true";
}

export function toPublicWorkspacePreferences(preferences: WorkspacePreferencesDocument): WorkspacePreferencesDocument {
  return {
    ...preferences,
    aiProvider: {
      ...preferences.aiProvider,
      preference: preferences.aiProvider.writerKeyEnabled ? "bring_your_own_key" : "platform_managed",
      researchKeyEnabled: false,
      researchKeyStatus: "not_configured",
      researchApiKey: "",
      researchProvider: "queuewrite",
      firecrawlApiKey: "",
      firecrawlKeyStatus: "not_configured"
    }
  };
}
