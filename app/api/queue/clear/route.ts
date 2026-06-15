import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";
import { getQueueMutationBlocker } from "@/lib/queue/safety";

export async function POST() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { store } = createRuntime();
  const blocker = await getQueueMutationBlocker(store);
  if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });
  const count = await store.clearQueueData();
  return NextResponse.json({ count });
}
