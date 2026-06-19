import Link from "next/link";
import type { BillingSnapshot } from "@/lib/billing/types";
import { usagePercent } from "@/lib/billing/usage";

export function UsagePopover({ snapshot, id }: { snapshot: BillingSnapshot | null; id: string }) {
  const words = snapshot?.usage.words;
  const percent = words ? usagePercent(words) : 0;
  return (
    <div id={id} role="dialog" aria-label="Account usage" className="absolute bottom-[calc(100%+8px)] right-0 z-50 w-72 rounded-lg border border-line bg-surface-1 p-3.5 font-sans text-ink shadow-2xl">
      {!snapshot ? <div className="py-4 text-center text-xs text-ink-muted">Loading billing usage...</div> : <>
        <div className="text-[13px] font-semibold">Usage</div>
        <div className="mt-0.5 text-[11px] text-ink-muted">{snapshot.plan.name} plan</div>
        <div className="mono mt-3 text-[11.5px] text-ink">{format(snapshot.usage.words.used)} / {format(snapshot.usage.words.allowed)} words</div>
        <div role="progressbar" aria-label="Word usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-ink" style={{ width: `${percent}%` }} />
        </div>
        <div className="mono mt-1.5 text-[10.5px] text-ink-subtle">{format(snapshot.usage.words.remaining)} remaining</div>
        <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-[11.5px]">
          <Metric label="Projects" used={snapshot.usage.projects.used} allowed={snapshot.usage.projects.allowed} />
          <Metric label="Research runs" used={snapshot.usage.researchRuns.used} allowed={snapshot.usage.researchRuns.allowed} />
          <Metric label="Exports" used={snapshot.usage.exports.used} allowed={snapshot.usage.exports.allowed} />
        </dl>
        <Link href="/settings/billing" className="mt-3 flex h-8 w-full items-center justify-center rounded border border-ink bg-ink text-[11.5px] font-medium text-white">View Billing</Link>
      </>}
    </div>
  );
}

function Metric({ label, used, allowed }: { label: string; used: number; allowed: number }) {
  return <div className="flex items-center justify-between gap-4"><dt className="text-ink-muted">{label}</dt><dd className="mono text-ink">{format(used)} / {format(allowed)}</dd></div>;
}

function format(value: number) { return new Intl.NumberFormat("en-GB").format(value); }
