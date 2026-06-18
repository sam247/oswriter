import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createWorkspaceStore } from "@/lib/storage/server";

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  return NextResponse.json(await createWorkspaceStore().getArticleListMetadata());
}
