import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/server/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { password?: string };
  const expected = process.env.WORKSPACE_PASSWORD ?? "oswriter";
  if (body.password !== expected) {
    return NextResponse.json({ error: "Incorrect workspace password" }, { status: 401 });
  }
  const jar = await cookies();
  jar.set(AUTH_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return NextResponse.json({ ok: true });
}
