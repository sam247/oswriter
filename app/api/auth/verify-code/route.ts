import { NextResponse } from "next/server";
import { AuthError, verifyOtp } from "@/lib/auth/service";
import { writeAuthCookie } from "@/lib/server/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as {
      email?: string;
      code?: string;
      purpose?: "login" | "signup";
    };
    if (!body.email || !body.code || (body.purpose !== "login" && body.purpose !== "signup")) {
      return NextResponse.json({ error: "Email, code, and purpose are required." }, { status: 400 });
    }
    const session = await verifyOtp({
      email: body.email,
      code: body.code,
      purpose: body.purpose
    });
    await writeAuthCookie(session.token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unable to verify your code.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
