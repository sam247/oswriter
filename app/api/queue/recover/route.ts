import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

export async function POST() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { runner } = createRuntime();
  const count = await runner.reclaimStale();
  return NextResponse.json({ count });
}
