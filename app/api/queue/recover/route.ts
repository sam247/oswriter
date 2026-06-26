import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

export async function POST() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { runner } = await createRuntime();
  const reconciled = await runner.reconcileSavedArticles();
  const recovered = await runner.reclaimStale();
  return NextResponse.json({ reconciled, recovered, count: reconciled + recovered });
}
