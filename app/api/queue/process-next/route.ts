import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

export const maxDuration = 60;

export async function POST() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { runner } = createRuntime();
  const result = await runner.processNext();
  return NextResponse.json(result);
}
