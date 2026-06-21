"use client";

import { Check, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HarperSuggestionCategory } from "@/lib/editor/harper/types";
import type { HarperSuggestionItem } from "@/components/editor/useHarperSuggestions";

type HarperSuggestionPanelProps = {
  activeSuggestionId: string | null;
  counts: Record<HarperSuggestionCategory, number>;
  error: string | null;
  status: "idle" | "loading" | "ready" | "error";
  suggestions: HarperSuggestionItem[];
  onAccept: (suggestionId: string) => void;
  onIgnore: (suggestionId: string) => void;
  onJump: (suggestionId: string) => void;
};

const CATEGORY_LABELS: Record<HarperSuggestionCategory, string> = {
  grammar: "Grammar",
  style: "Style",
  readability: "Readability"
};

export function HarperSuggestionPanel({
  activeSuggestionId,
  counts,
  error,
  status,
  suggestions,
  onAccept,
  onIgnore,
  onJump
}: HarperSuggestionPanelProps) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        {(["grammar", "style", "readability"] as const).map((category) => (
          <div key={category} className="rounded-md border border-line bg-background p-2.5">
            <div className="mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">{CATEGORY_LABELS[category]}</div>
            <div className="mt-1 text-lg font-semibold text-ink">{counts[category]}</div>
            <div className="text-xs text-ink-muted">issues</div>
          </div>
        ))}
      </div>

      {status === "loading" && (
        <div className="flex items-center gap-2 rounded-md border border-line bg-background px-3 py-2 text-xs text-ink-muted">
          <Loader2 className="size-3.5 animate-spin" />
          Analyzing article writing...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {status !== "loading" && suggestions.length === 0 && !error && (
        <div className="rounded-md border border-line bg-background px-3 py-4 text-sm text-ink-muted">
          No writing suggestions right now.
        </div>
      )}

      {(["grammar", "style", "readability"] as const).map((category) => {
        const items = suggestions.filter((item) => item.category === category);
        if (!items.length) return null;
        return (
          <section key={category} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">{CATEGORY_LABELS[category]}</h3>
              <span className="mono text-[10.5px] text-ink-subtle">{items.length} shown</span>
            </div>
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-md border border-line bg-background p-3 transition-colors hover:border-line-strong",
                    activeSuggestionId === item.id && "border-line-strong bg-surface-1 shadow-sm"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink">{item.message}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-ink-muted">
                        {item.problemText || "Suggested wording improvement"}
                      </div>
                      {item.replacementText && (
                        <div className="mt-2 rounded bg-surface-2 px-2 py-1 text-xs text-ink">
                          Suggestion: {item.replacementText || "Remove"}
                        </div>
                      )}
                    </div>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-subtle">
                      {item.kind}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onJump(item.id)}
                      className="text-xs font-medium text-ink-muted hover:text-ink"
                    >
                      Jump to issue
                    </button>
                    <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onAccept(item.id)}
                      disabled={!item.suggestionCount}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface-1 px-2.5 text-xs font-medium text-ink hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Check className="size-3.5" />
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => onIgnore(item.id)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-background px-2.5 text-xs font-medium text-ink-muted hover:border-line-strong hover:text-ink"
                    >
                      <EyeOff className="size-3.5" />
                      Ignore
                    </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
