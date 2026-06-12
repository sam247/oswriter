import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const AUTH_COOKIE = "osw_auth";

export async function isAuthed() {
  const jar = await cookies();
  const expected = process.env.WORKSPACE_PASSWORD ?? "oswriter";
  return jar.get(AUTH_COOKIE)?.value === expected;
}

export async function requireAuth() {
  if (await isAuthed()) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
