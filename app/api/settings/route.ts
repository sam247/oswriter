import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";
import { nowIso } from "@/lib/defaults";
import type { WorkspacePreferencesDocument } from "@/lib/types";
import { toPublicWorkspacePreferences } from "@/lib/research/providers/public";
import { validateTavilyApiKey } from "@/lib/research/providers/tavily";

type SettingsPatch = {
  preferences?: Partial<{
    account: Partial<WorkspacePreferencesDocument["account"]>;
    notifications: Partial<WorkspacePreferencesDocument["notifications"]>;
    aiProvider: Partial<WorkspacePreferencesDocument["aiProvider"]>;
    operational: Partial<WorkspacePreferencesDocument["operational"]>;
  }>;
};

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { store } = await createRuntime();
  const [settings, preferences] = await Promise.all([
    store.getSettings(),
    store.getWorkspacePreferences()
  ]);
  return NextResponse.json({ settings, preferences: toPublicWorkspacePreferences(preferences) });
}

export async function PATCH(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const patch = await req.json().catch(() => ({})) as SettingsPatch;
  const { store } = await createRuntime();
  const [settings, preferences] = await Promise.all([
    store.getSettings(),
    store.getWorkspacePreferences()
  ]);
  const replacementResearchKey = patch.preferences?.aiProvider?.researchApiKey?.trim();
  if (replacementResearchKey && !await validateTavilyApiKey(replacementResearchKey)) {
    return NextResponse.json({ error: "Tavily API key could not be validated." }, { status: 400 });
  }
  const nextPreferences = mergePreferences(preferences, patch);
  if (patch.preferences?.aiProvider?.researchProvider === "byok" && nextPreferences.aiProvider.researchKeyStatus !== "configured") {
    return NextResponse.json({ error: "Configure a valid Tavily API key before selecting BYOK Experimental." }, { status: 400 });
  }
  await Promise.all([
    store.saveSettings(settings),
    store.saveWorkspacePreferences(nextPreferences)
  ]);
  return NextResponse.json({ settings, preferences: toPublicWorkspacePreferences(nextPreferences) });
}

function mergePreferences(preferences: WorkspacePreferencesDocument, patch: SettingsPatch): WorkspacePreferencesDocument {
  const account = patch.preferences?.account ?? {};
  const notifications = patch.preferences?.notifications ?? {};
  const aiProvider = patch.preferences?.aiProvider ?? {};
  const writerKeyEnabled = bool(aiProvider.writerKeyEnabled, preferences.aiProvider.writerKeyEnabled);
  const writerApiKey = cleanSecret(aiProvider.writerApiKey, preferences.aiProvider.writerApiKey);
  const researchApiKey = cleanReplacementSecret(aiProvider.researchApiKey, preferences.aiProvider.researchApiKey);
  const researchKeyConfigured = Boolean(researchApiKey);
  const requestedResearchProvider = aiProvider.researchProvider ?? preferences.aiProvider.researchProvider ?? "queuewrite";
  const researchProvider = requestedResearchProvider === "byok" && researchKeyConfigured ? "byok" : "queuewrite";
  const providerPreference = writerKeyEnabled ? "bring_your_own_key" : "platform_managed";
  const notificationsEnabled = bool(notifications.enabled, preferences.notifications.enabled);
  return {
    ...preferences,
    account: {
      ...preferences.account,
      name: cleanString(account.name, preferences.account.name),
      email: cleanString(account.email, preferences.account.email),
      workspaceName: cleanString(account.workspaceName, preferences.account.workspaceName)
    },
    notifications: {
      ...preferences.notifications,
      enabled: notificationsEnabled,
      queueCompleted: notificationsEnabled,
      queueCompletedWithWarnings: notificationsEnabled,
      queueFailed: notificationsEnabled,
      dailySummaryEmail: false,
      weeklySummaryEmail: false
    },
    aiProvider: {
      preference: providerPreference,
      personalKeyStatus: providerPreference === "bring_your_own_key" ? "placeholder" : "not_configured",
      writerKeyEnabled,
      writerApiKey: writerKeyEnabled ? writerApiKey : "",
      writerKeyStatus: writerKeyEnabled && writerApiKey ? "configured" : writerKeyEnabled ? "placeholder" : "not_configured",
      researchKeyEnabled: researchKeyConfigured,
      researchApiKey,
      researchKeyStatus: researchKeyConfigured ? "configured" : "not_configured",
      researchProvider,
      byokResearchProvider: "tavily"
    },
    operational: {
      ...preferences.operational,
      autoStartQueueOnAdd: false,
      confirmBeforeDeletingArticles: true,
      confirmBeforeDeletingProjects: true,
      defaultTargetWordCount: preferences.operational.defaultTargetWordCount,
      reuseProjectResearch: false,
      reuseTitleResearch: false
    },
    updatedAt: nowIso()
  };
}

function cleanString(value: unknown, fallback: string) {
  return typeof value === "string" ? value.trim().slice(0, 180) : fallback;
}

function cleanSecret(value: unknown, fallback: string) {
  return typeof value === "string" ? value.trim().slice(0, 500) : fallback;
}

function cleanReplacementSecret(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : fallback;
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}
