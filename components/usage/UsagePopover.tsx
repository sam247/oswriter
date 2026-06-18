import type { UsageSummary } from "@/lib/usage/usage";
import { daysUntilUsageReset, formatUsageNumber, usagePercentage } from "@/lib/usage/usage";

interface UsagePopoverProps {
  usage: UsageSummary;
  id: string;
}

export function UsagePopover({ usage, id }: UsagePopoverProps) {
  const percent = usagePercentage(usage);
  const resetDays = daysUntilUsageReset(usage);

  return (
    <div
      id={id}
      role="dialog"
      aria-label="Account usage"
      className="absolute bottom-[calc(100%+8px)] right-0 z-50 w-72 rounded-lg border border-line bg-surface-1 p-3.5 font-sans text-ink shadow-2xl"
    >
      <div className="text-[13px] font-semibold">Usage</div>
      <div className="mt-0.5 text-[11px] text-ink-muted">{usage.planName}</div>

      <div className="mono mt-3 text-[11.5px] text-ink">
        {formatUsageNumber(usage.wordsUsed)} / {formatUsageNumber(usage.wordsLimit)} words
      </div>
      <div
        role="progressbar"
        aria-label="Word usage"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"
      >
        <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <div className="mono mt-1.5 text-[10.5px] text-ink-subtle">{percent}% used</div>

      <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-[11.5px]">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-ink-muted">Articles generated</dt>
          <dd className="mono text-ink">{formatUsageNumber(usage.articlesGenerated)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-ink-muted">Research requests</dt>
          <dd className="mono text-ink">{formatUsageNumber(usage.researchRequests)}</dd>
        </div>
      </dl>

      <div className="mt-3 border-t border-line pt-3 text-[11px] text-ink-muted">
        Resets in {resetDays} day{resetDays === 1 ? "" : "s"}
      </div>
      <button
        type="button"
        disabled
        title="Plan upgrades are not available in this preview"
        className="mt-3 h-8 w-full rounded border border-line bg-surface-2 text-[11.5px] font-medium text-ink-muted opacity-70"
      >
        Upgrade Plan
      </button>
    </div>
  );
}
