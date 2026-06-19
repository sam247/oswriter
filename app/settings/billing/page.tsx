import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ChevronLeft, Gauge, LockKeyhole } from "lucide-react";
import { BillingService } from "@/lib/billing/service";
import { BILLING_PLANS } from "@/lib/billing/plans";
import { usagePercent } from "@/lib/billing/usage";
import { WorkspaceUsageProvider } from "@/lib/billing/workspace-usage";
import type { BillingMetric, BillingPlan, UsageMetricSnapshot } from "@/lib/billing/types";
import { isAuthed } from "@/lib/server/auth";
import { createWorkspaceStore } from "@/lib/storage/server";
import { cn } from "@/lib/utils";

const METRIC_LABELS: Record<BillingMetric, string> = {
  projects: "Projects",
  words: "Words",
  researchRuns: "Research runs",
  exports: "Exports",
  mcpAccess: "MCP access",
  byokAccess: "BYOK access"
};

export default async function BillingSettingsPage() {
  if (!await isAuthed()) redirect("/");
  const store = createWorkspaceStore();
  const snapshot = await new BillingService(new WorkspaceUsageProvider(store)).getSnapshot("default-workspace");

  return (
    <main className="min-h-screen bg-background text-ink">
      <header className="hairline-b bg-surface-1">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">Settings / Billing</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Billing</h1>
          </div>
          <Link href="/" className="flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-ink-muted hover:bg-surface-3 hover:text-ink">
            <ChevronLeft className="size-4" /> Back to workspace
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-5 py-8 sm:px-8">
        <section className="grid gap-4 lg:grid-cols-[1.15fr_1.85fr]">
          <div className="rounded-lg border border-line bg-surface-1 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Current plan</p>
                <h2 className="mt-2 text-2xl font-semibold">{snapshot.plan.name}</h2>
                <p className="mt-1 text-sm text-ink-muted">{snapshot.plan.description}</p>
              </div>
              <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium capitalize text-success">{snapshot.subscription.status}</span>
            </div>
            <div className="mt-6 flex items-end justify-between border-t border-line pt-4">
              <div>
                <span className="text-2xl font-semibold">{formatPrice(snapshot.plan)}</span>
                <span className="text-sm text-ink-muted"> / month</span>
              </div>
              <div className="mono text-right text-[10px] text-ink-subtle">
                Renews {formatDate(snapshot.period.end)}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface-1 p-5 shadow-sm">
            <div className="flex items-center gap-2"><Gauge className="size-4" /><h2 className="font-semibold">Usage</h2></div>
            <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {(Object.entries(snapshot.usage) as [BillingMetric, UsageMetricSnapshot][]).map(([metric, usage]) => (
                <UsageRow key={metric} metric={metric} usage={usage} />
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Plans and limits</p>
            <h2 className="mt-1 text-xl font-semibold">Choose how you work</h2>
            <p className="mt-1 text-sm text-ink-muted">Placeholder pricing. Checkout will be enabled when Stripe is connected.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {BILLING_PLANS.map((plan) => <PlanCard key={plan.id} plan={plan} current={plan.id === snapshot.plan.id} />)}
          </div>
        </section>

        <section className="flex flex-col justify-between gap-4 rounded-lg border border-line bg-ink p-5 text-white sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="size-4" /> Upgrade your workspace</div>
            <p className="mt-1 text-sm text-white/65">Unlock larger limits, MCP access, or bring your own provider keys.</p>
          </div>
          <button disabled className="h-9 rounded-md bg-white px-4 text-sm font-semibold text-ink opacity-80" title="Stripe checkout is not connected yet">Upgrade Plan</button>
        </section>
      </div>
    </main>
  );
}

function UsageRow({ metric, usage }: { metric: BillingMetric; usage: UsageMetricSnapshot }) {
  const accessMetric = metric === "mcpAccess" || metric === "byokAccess";
  const percent = usagePercent(usage);
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{METRIC_LABELS[metric]}</span>
        <span className="mono text-ink-muted">{accessMetric ? (usage.allowed ? "Included" : "Not included") : `${formatNumber(usage.used)} / ${formatNumber(usage.allowed)}`}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-ink" style={{ width: `${percent}%` }} /></div>
      <div className="mono mt-1.5 text-[10px] text-ink-subtle">{accessMetric ? `${usage.remaining} access remaining` : `${formatNumber(usage.remaining)} remaining`}</div>
    </div>
  );
}

function PlanCard({ plan, current }: { plan: BillingPlan; current: boolean }) {
  return (
    <article className={cn("relative rounded-lg border bg-surface-1 p-5 shadow-sm", plan.highlighted ? "border-ink" : "border-line")}>
      {plan.highlighted && <span className="absolute right-4 top-4 rounded-full bg-ink px-2 py-0.5 text-[10px] font-medium text-white">Popular</span>}
      <h3 className="text-lg font-semibold">{plan.name}</h3>
      <p className="mt-1 min-h-10 text-sm text-ink-muted">{plan.description}</p>
      <div className="mt-4"><span className="text-2xl font-semibold">{formatPrice(plan)}</span><span className="text-sm text-ink-muted"> / mo</span></div>
      <ul className="mt-5 space-y-2.5 text-xs text-ink-muted">
        {(Object.entries(plan.limits) as [BillingMetric, number][]).map(([metric, limit]) => (
          <li key={metric} className="flex items-center gap-2"><Check className="size-3.5 text-success" /> {METRIC_LABELS[metric]}: {metric.endsWith("Access") ? (limit ? "Included" : "Not included") : formatNumber(limit)}</li>
        ))}
      </ul>
      <button disabled className={cn("mt-5 h-9 w-full rounded-md border text-sm font-medium", current ? "border-line bg-surface-2 text-ink-muted" : "border-ink bg-ink text-white opacity-75")}>
        {current ? "Current Plan" : "Upgrade Soon"}
      </button>
    </article>
  );
}

function formatNumber(value: number) { return new Intl.NumberFormat("en-GB").format(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }
function formatPrice(plan: BillingPlan) { return plan.price.amount === 0 ? "Free" : new Intl.NumberFormat("en-GB", { style: "currency", currency: plan.price.currency, maximumFractionDigits: 0 }).format(plan.price.amount); }
