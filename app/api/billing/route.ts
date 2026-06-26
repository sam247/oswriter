import { NextResponse } from "next/server";
import { BillingService } from "@/lib/billing/service";
import { WorkspaceUsageProvider } from "@/lib/billing/workspace-usage";
import { BILLING_PLANS } from "@/lib/billing/plans";
import { requireAuth } from "@/lib/server/auth";
import { createWorkspaceStore } from "@/lib/storage/server";

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const store = await createWorkspaceStore();
  const snapshot = await new BillingService(new WorkspaceUsageProvider(store)).getSnapshot("default-workspace");
  return NextResponse.json({ snapshot, plans: BILLING_PLANS });
}
