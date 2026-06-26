import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

export async function POST() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { runner, store } = await createRuntime();
  const job = await runner.cancelCurrent();
  const state = await store.getState();
  return NextResponse.json({ job, state });
}
