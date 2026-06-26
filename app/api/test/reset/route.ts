import { NextResponse } from "next/server";
import { resetMemoryAuthStore } from "@/lib/auth/store";
import { resetMemoryMailbox } from "@/lib/mail/service";
import { resetSharedMemoryStorage } from "@/lib/storage/memory";

export async function POST() {
  if (process.env.ENABLE_TEST_API !== "1") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  resetMemoryAuthStore();
  resetMemoryMailbox();
  resetSharedMemoryStorage();
  return NextResponse.json({ ok: true });
}
