import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createWorkspaceStore } from "@/lib/storage/server";
import type { HarperTelemetryAction, HarperTelemetryCategory, HarperTelemetryEventInput } from "@/lib/analytics/harper";

const VALID_ACTIONS = new Set<HarperTelemetryAction>(["shown", "accepted", "ignored"]);
const VALID_CATEGORIES = new Set<HarperTelemetryCategory>(["grammar", "style", "readability", "spelling", "usage"]);

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  return NextResponse.json(await createWorkspaceStore().getHarperTelemetryReport());
}

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const body = await req.json().catch(() => ({})) as { events?: HarperTelemetryEventInput[] };
  const events = Array.isArray(body.events) ? body.events.filter(isValidHarperTelemetryEvent) : [];
  if (!events.length) return NextResponse.json({ error: "Missing telemetry events." }, { status: 400 });

  await createWorkspaceStore().recordHarperTelemetry(events);
  return NextResponse.json({ recorded: events.length });
}

function isValidHarperTelemetryEvent(event: unknown): event is HarperTelemetryEventInput {
  if (!event || typeof event !== "object") return false;
  const candidate = event as Record<string, unknown>;
  return typeof candidate.article_id === "string"
    && typeof candidate.rule_id === "string"
    && typeof candidate.suggestion_id === "string"
    && typeof candidate.timestamp === "string"
    && VALID_ACTIONS.has(candidate.action as HarperTelemetryAction)
    && VALID_CATEGORIES.has(candidate.category as HarperTelemetryCategory);
}
