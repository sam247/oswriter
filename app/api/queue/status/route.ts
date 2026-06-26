import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createWorkspaceStore } from "@/lib/storage/server";

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  // Queue polling must never load full project state.
  const store = await createWorkspaceStore();
  const status = await store.getQueueStatus();
  return NextResponse.json(status);
}
