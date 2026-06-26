import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { store, runner } = await createRuntime();
  const url = new URL(req.url);
  if (url.searchParams.get("reconcile") === "1") await runner.reconcileSavedArticles();
  const state = await store.getState();
  return NextResponse.json(state);
}
