import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";
import { getWorkerQueueSnapshot } from "@/lib/worker/drain";

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { store } = await createRuntime();
  const snapshot = await getWorkerQueueSnapshot(store);
  return NextResponse.json({
    serverTime: new Date().toISOString(),
    ...snapshot
  });
}
