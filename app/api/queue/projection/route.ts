import { NextResponse } from "next/server";
import { projectQueueCost } from "@/lib/queue/projection";
import { requireAuth } from "@/lib/server/auth";
import { createWorkspaceStore } from "@/lib/storage/server";

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const store = await createWorkspaceStore();
  const state = await store.getState();
  const telemetry = await store.listGenerationTelemetry(state.project.id);
  const articleCount = state.jobs.filter((job) => job.status === "queued").length;
  return NextResponse.json(projectQueueCost({
    articleCount,
    profile: state.project.profile,
    fallbackTargetWords: state.settings.controls.lengthTargetWords,
    telemetry,
    generationModel: process.env.AI_GENERATION_MODEL ?? "deepseek-v4-flash",
    generationProvider: "openai-compatible"
  }));
}
