import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { id } = await context.params;
  const { store } = await createRuntime();
  const [research, debug] = await Promise.all([
    store.getResearch(id),
    store.getDebug(id)
  ]);
  return NextResponse.json({ research, debug });
}
