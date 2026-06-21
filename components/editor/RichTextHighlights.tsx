"use client";

import { useEffect } from "react";
import type { HarperSuggestionCategory } from "@/lib/editor/harper/types";

type RichTextHighlightsProps = {
  activeSuggestionId: string | null;
  editor: HTMLDivElement | null;
  suggestions: Array<{
    id: string;
    category: HarperSuggestionCategory;
    plainStart: number;
    plainEnd: number;
  }>;
};

const HIGHLIGHT_NAMES = ["harper-grammar", "harper-style", "harper-readability", "harper-active"] as const;

export function RichTextHighlights({ activeSuggestionId, editor, suggestions }: RichTextHighlightsProps) {
  useEffect(() => {
    const registry = getHighlightRegistry();
    if (!editor || !registry) return;

    for (const name of HIGHLIGHT_NAMES) registry.delete(name);

    const grouped = {
      "harper-grammar": [] as Range[],
      "harper-style": [] as Range[],
      "harper-readability": [] as Range[],
      "harper-active": [] as Range[]
    };

    for (const suggestion of suggestions) {
      const range = createDomRangeFromOffsets(editor, suggestion.plainStart, suggestion.plainEnd);
      if (!range) continue;
      grouped[highlightNameForCategory(suggestion.category)].push(range.cloneRange());
      if (suggestion.id === activeSuggestionId) grouped["harper-active"].push(range.cloneRange());
    }

    for (const name of HIGHLIGHT_NAMES) {
      if (grouped[name].length) registry.set(name, new window.Highlight(...grouped[name]));
    }

    return () => {
      for (const name of HIGHLIGHT_NAMES) registry.delete(name);
    };
  }, [activeSuggestionId, editor, suggestions]);

  return null;
}

function highlightNameForCategory(category: HarperSuggestionCategory) {
  if (category === "grammar") return "harper-grammar";
  if (category === "readability") return "harper-readability";
  return "harper-style";
}

function getHighlightRegistry() {
  const cssWithHighlights = CSS as typeof CSS & {
    highlights?: {
      delete(name: string): boolean;
      set(name: string, value: unknown): unknown;
    };
  };
  if (typeof window === "undefined" || typeof window.Highlight === "undefined" || !cssWithHighlights.highlights) return null;
  return cssWithHighlights.highlights;
}

function createDomRangeFromOffsets(root: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let cursor = 0;
  let current = walker.nextNode();

  while (current) {
    const textNode = current as Text;
    const text = textNode.textContent ?? "";
    nodes.push({
      node: textNode,
      start: cursor,
      end: cursor + text.length
    });
    cursor += text.length;
    current = walker.nextNode();
  }

  const startNode = nodes.find((item) => start >= item.start && start <= item.end);
  const endNode = nodes.find((item) => end >= item.start && end <= item.end) ?? nodes.find((item) => end === item.end);
  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(startNode.node, Math.max(start - startNode.start, 0));
  range.setEnd(endNode.node, Math.max(end - endNode.start, 0));
  return range;
}
