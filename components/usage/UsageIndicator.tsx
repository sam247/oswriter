"use client";

import { Gauge } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { UsagePopover } from "@/components/usage/UsagePopover";
import type { BillingSnapshot } from "@/lib/billing/types";
import { usagePercent } from "@/lib/billing/usage";

export function UsageIndicator() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverId = useId();

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/billing", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { snapshot?: BillingSnapshot } | null) => setSnapshot(data?.snapshot ?? null))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

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

  const percent = snapshot ? usagePercent(snapshot.usage.words) : 0;
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
        <span>Usage {snapshot ? `${percent}%` : "..."}</span>
      </button>
      {open && <UsagePopover snapshot={snapshot} id={popoverId} />}
    </div>
  );
}
