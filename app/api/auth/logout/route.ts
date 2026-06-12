import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/server/auth";

export async function POST() {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE);
  return NextResponse.json({ ok: true });
}
