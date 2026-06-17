import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";
import { nowIso } from "@/lib/defaults";
import type { AiProviderPreference, WorkspacePreferencesDocument } from "@/lib/types";

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
  const { store } = createRuntime();
  const [settings, preferences] = await Promise.all([
    store.getSettings(),
    store.getWorkspacePreferences()
  ]);
  return NextResponse.json({ settings, preferences });
}

export async function PATCH(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const patch = await req.json().catch(() => ({})) as SettingsPatch;
  const { store } = createRuntime();
  const [settings, preferences] = await Promise.all([
    store.getSettings(),
    store.getWorkspacePreferences()
  ]);
  const nextPreferences = mergePreferences(preferences, patch);
  await Promise.all([
    store.saveSettings(settings),
    store.saveWorkspacePreferences(nextPreferences)
  ]);
  return NextResponse.json({ settings, preferences: nextPreferences });
}

function mergePreferences(preferences: WorkspacePreferencesDocument, patch: SettingsPatch): WorkspacePreferencesDocument {
  const account = patch.preferences?.account ?? {};
  const notifications = patch.preferences?.notifications ?? {};
  const aiProvider = patch.preferences?.aiProvider ?? {};
  const operational = patch.preferences?.operational ?? {};
  const providerPreference = normalizeProviderPreference(aiProvider.preference ?? preferences.aiProvider.preference);
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
      queueCompleted: bool(notifications.queueCompleted, preferences.notifications.queueCompleted),
      queueCompletedWithWarnings: bool(notifications.queueCompletedWithWarnings, preferences.notifications.queueCompletedWithWarnings),
      queueFailed: bool(notifications.queueFailed, preferences.notifications.queueFailed),
      dailySummaryEmail: bool(notifications.dailySummaryEmail, preferences.notifications.dailySummaryEmail),
      weeklySummaryEmail: bool(notifications.weeklySummaryEmail, preferences.notifications.weeklySummaryEmail)
    },
    aiProvider: {
      preference: providerPreference,
      personalKeyStatus: providerPreference === "bring_your_own_key" ? "placeholder" : "not_configured"
    },
    operational: {
      ...preferences.operational,
      autoStartQueueOnAdd: bool(operational.autoStartQueueOnAdd, preferences.operational.autoStartQueueOnAdd),
      confirmBeforeDeletingArticles: bool(operational.confirmBeforeDeletingArticles, preferences.operational.confirmBeforeDeletingArticles),
      confirmBeforeDeletingProjects: bool(operational.confirmBeforeDeletingProjects, preferences.operational.confirmBeforeDeletingProjects),
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

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeProviderPreference(value: unknown): AiProviderPreference {
  return value === "bring_your_own_key" ? "bring_your_own_key" : "platform_managed";
}
