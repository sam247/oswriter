import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

type JobAction = "skip" | "regenerate_later" | "move_up" | "move_down" | "move_top" | "move_bottom";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { id } = await context.params;
  const body = await req.json().catch(() => ({})) as { action?: JobAction };
  const { runner } = createRuntime();

  try {
    if (body.action === "skip") return NextResponse.json({ job: await runner.skipJob(id) });
    if (body.action === "regenerate_later") return NextResponse.json({ job: await runner.regenerateLater(id) });
    if (body.action === "move_up") return NextResponse.json({ job: await runner.moveJob(id, "up") });
    if (body.action === "move_down") return NextResponse.json({ job: await runner.moveJob(id, "down") });
    if (body.action === "move_top") return NextResponse.json({ job: await runner.moveJob(id, "top") });
    if (body.action === "move_bottom") return NextResponse.json({ job: await runner.moveJob(id, "bottom") });
    return NextResponse.json({ error: "Unsupported job action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Job action failed." }, { status: 409 });
  }
}
