import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const body = await req.json().catch(() => ({})) as { titles?: string[] | string };
  const titles = Array.isArray(body.titles) ? body.titles : String(body.titles ?? "").split("\n");
  const { runner } = createRuntime();
  const jobs = await runner.addTitles(titles);
  return NextResponse.json({ jobs });
}
