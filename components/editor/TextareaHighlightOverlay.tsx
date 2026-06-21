"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { HarperSuggestionCategory } from "@/lib/editor/harper/types";

type TextareaHighlightOverlayProps = {
  activeSuggestionId: string | null;
  markdown: string;
  scrollLeft: number;
  scrollTop: number;
  suggestions: Array<{
    id: string;
    category: HarperSuggestionCategory;
    markdownStart: number;
    markdownEnd: number;
  }>;
};

type Fragment = {
  text: string;
  category?: HarperSuggestionCategory;
  active?: boolean;
  key: string;
};

export function TextareaHighlightOverlay({
  activeSuggestionId,
  markdown,
  scrollLeft,
  scrollTop,
  suggestions
}: TextareaHighlightOverlayProps) {
  const fragments = useMemo(() => {
    if (!markdown.length) return [{ key: "empty", text: " " }] satisfies Fragment[];
    const ordered = [...suggestions]
      .filter((item) => item.markdownEnd > item.markdownStart)
      .sort((left, right) => left.markdownStart - right.markdownStart);
    const next: Fragment[] = [];
    let cursor = 0;

    for (const item of ordered) {
      if (item.markdownStart > cursor) {
        next.push({
          key: `plain-${cursor}`,
          text: markdown.slice(cursor, item.markdownStart)
        });
      }
      next.push({
        key: item.id,
        text: markdown.slice(item.markdownStart, item.markdownEnd),
        category: item.category,
        active: activeSuggestionId === item.id
      });
      cursor = item.markdownEnd;
    }

    if (cursor < markdown.length) {
      next.push({
        key: `plain-${cursor}`,
        text: markdown.slice(cursor)
      });
    }

    const trailing = next[next.length - 1];
    if (trailing) trailing.text = trailing.text.endsWith("\n") ? `${trailing.text} ` : trailing.text;
    return next.length ? next : [{ key: "fallback", text: `${markdown} ` }];
  }, [activeSuggestionId, markdown, suggestions]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
      <div
        className="whitespace-pre-wrap break-words px-2 py-2 text-[17px] leading-8"
        style={{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }}
      >
        {fragments.map((fragment) => (
          <span
            key={fragment.key}
            className={cn(
              "text-transparent",
              fragment.category === "grammar" && "harper-overlay-grammar",
              fragment.category === "style" && "harper-overlay-style",
              fragment.category === "readability" && "harper-overlay-readability",
              fragment.active && "harper-overlay-active"
            )}
          >
            {fragment.text}
          </span>
        ))}
      </div>
    </div>
  );
}
