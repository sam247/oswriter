import { NextResponse } from "next/server";
import { listMemoryMailbox } from "@/lib/mail/service";

export async function GET() {
  if (process.env.ENABLE_TEST_API !== "1") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ messages: listMemoryMailbox() });
}
