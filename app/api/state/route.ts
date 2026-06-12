import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { store, runner } = createRuntime();
  await runner.reconcileSavedArticles();
  const state = await store.getState();
  return NextResponse.json(state);
}
