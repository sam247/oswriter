import { NextResponse } from "next/server";
import { createRuntime } from "@/lib/server/runtime";
import { drainActiveProjectsWithLeases, isWorkerRequestAuthorized } from "@/lib/worker/drain";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isWorkerRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { store, runner } = createRuntime();
  const result = await drainActiveProjectsWithLeases({ store, runner });
  console.info("worker.drain", JSON.stringify(result));
  return NextResponse.json(result);
}
