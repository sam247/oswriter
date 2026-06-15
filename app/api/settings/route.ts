import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";
import type { ContentControls } from "@/lib/types";
import { getSettingsMutationBlocker } from "@/lib/queue/safety";

export async function PATCH(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const patch = await req.json().catch(() => ({})) as Partial<ContentControls>;
  const { store } = createRuntime();
  const blocker = await getSettingsMutationBlocker(store);
  if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });
  const settings = await store.getSettings();
  const lengthTargetWords = Number(patch.lengthTargetWords ?? settings.controls.lengthTargetWords);
  const next = {
    ...settings,
    controls: {
      ...settings.controls,
      ...patch,
      lengthTargetWords: Number.isFinite(lengthTargetWords)
        ? Math.max(300, Math.min(5000, Math.round(lengthTargetWords)))
        : settings.controls.lengthTargetWords
    }
  };
  await store.saveSettings(next);
  return NextResponse.json(next);
}
