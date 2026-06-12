import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { id } = await context.params;
  const { runner } = createRuntime();
  const job = await runner.retryJob(id);
  return NextResponse.json({ job });
}
