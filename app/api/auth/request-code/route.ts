import { NextResponse } from "next/server";
import { AuthError, requestOtp } from "@/lib/auth/service";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { email?: string; purpose?: "login" | "signup" };
    if (!body.email || (body.purpose !== "login" && body.purpose !== "signup")) {
      return NextResponse.json({ error: "Email and purpose are required." }, { status: 400 });
    }
    const result = await requestOtp({
      email: body.email,
      purpose: body.purpose,
      requestIp: forwardedFor(req)
    });
    return NextResponse.json({
      ok: true,
      ...(process.env.ENABLE_TEST_API === "1" ? { testCode: result.code } : {})
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unable to send a sign-in code.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function forwardedFor(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? null;
}
