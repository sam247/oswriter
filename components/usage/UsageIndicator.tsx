"use client";

import { Gauge } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { UsagePopover } from "@/components/usage/UsagePopover";
import { getUsageSummary, usagePercentage } from "@/lib/usage/usage";

export function UsageIndicator() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverId = useId();
  const usage = useMemo(() => getUsageSummary(), []);
  const percent = usagePercentage(usage);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-ink-subtle hover:bg-surface-3 hover:text-ink"
        title="View account usage"
      >
        <Gauge className="size-3" aria-hidden="true" />
        <span>Usage {percent}%</span>
      </button>
      {open && <UsagePopover usage={usage} id={popoverId} />}
    </div>
  );
}
