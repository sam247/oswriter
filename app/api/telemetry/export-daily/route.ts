import { NextResponse } from "next/server";
import { createRuntime } from "@/lib/server/runtime";
import { exportDailyTelemetrySummary, retryFailedTelemetryExports } from "@/lib/telemetry/sheets-export";
import { isWorkerRequestAuthorized } from "@/lib/worker/drain";

export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isWorkerRequestAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? undefined;
  const { store } = createRuntime();
  const retry = await retryFailedTelemetryExports(store);
  await exportDailyTelemetrySummary(store, date);
  return NextResponse.json({ ok: true, date: date ?? "previous_utc_date", retry });
}
