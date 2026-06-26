import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionByToken, type VerifiedAuthSession, revokeSession } from "@/lib/auth/service";

export const AUTH_COOKIE = "osw_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function getAuthSession(): Promise<VerifiedAuthSession | null> {
  try {
    const jar = await cookies();
    const token = jar.get(AUTH_COOKIE)?.value;
    if (!token) return null;
    return getSessionByToken(token);
  } catch {
    return null;
  }
}

export async function isAuthed() {
  return Boolean(await getAuthSession());
}

export async function requireAuth() {
  if (await isAuthed()) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function writeAuthCookie(token: string) {
  const jar = await cookies();
  jar.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });
}

export async function clearAuthCookie() {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  if (token) await revokeSession(token);
  jar.delete(AUTH_COOKIE);
}
