import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";
import { getQueueMutationBlocker } from "@/lib/queue/safety";
import { nowIso } from "@/lib/defaults";

export async function POST() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { store } = createRuntime();
  const blocker = await getQueueMutationBlocker(store);
  if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });
  const count = await store.clearQueueData();
  const now = nowIso();
  await store.saveQueueControl({
    ...await store.getQueueControl(),
    mode: "stopped",
    requestedBy: "user",
    requestedAt: now,
    stoppedAt: now,
    reason: "Queue cleared.",
    updatedAt: now
  });
  await store.deleteWorkerLease();
  const state = await store.getState();
  return NextResponse.json({ count, state });
}
