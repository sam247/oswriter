import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Password login has been replaced by email sign-in codes. Use /login instead." },
    { status: 410 }
  );
}
