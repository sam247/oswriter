import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createRuntime } from "@/lib/server/runtime";

export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const url = new URL(req.url);
  const query = url.searchParams.get("q") ?? "";
  const { store } = createRuntime();
  const results = await store.globalSearch(query);
  return NextResponse.json(results);
}
