import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";
import { normalizeContentProfile } from "@/lib/content-profiles";

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const body = await req.json().catch(() => ({})) as { titles?: string[] | string; avoidDuplicates?: boolean; contentProfile?: string };
  const titles = Array.isArray(body.titles) ? body.titles : String(body.titles ?? "").split("\n");
  const { runner, store } = createRuntime();
  const contentProfile = normalizeContentProfile(body.contentProfile);
  const jobs = body.avoidDuplicates ? await runner.addUniqueTitles(titles, undefined, contentProfile) : await runner.addTitles(titles, undefined, contentProfile);
  const state = await store.getState();
  return NextResponse.json({ jobs, state });
}
