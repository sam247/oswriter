import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const body = await req.json().catch(() => ({})) as { action?: string };
  const { runner } = createRuntime();
  if (body.action === "stop_after_current") {
    const queueControl = await runner.stopAfterCurrent();
    return NextResponse.json({ queueControl });
  }
  if (body.action === "resume") {
    const queueControl = await runner.resumeQueue();
    return NextResponse.json({ queueControl });
  }
  return NextResponse.json({ error: "Unsupported queue control action." }, { status: 400 });
}
