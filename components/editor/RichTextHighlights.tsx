"use client";

import { useEffect } from "react";
import type { HarperSuggestionCategory } from "@/lib/editor/harper/types";

type RichTextHighlightsProps = {
  activeSuggestionId: string | null;
  editor: HTMLDivElement | null;
  suggestions: Array<{
    id: string;
    groupId?: string;
    category: HarperSuggestionCategory;
    plainStart: number;
    plainEnd: number;
  }>;
};

const HIGHLIGHT_NAMES = ["harper-grammar", "harper-punctuation", "harper-spelling", "harper-style", "harper-readability", "harper-active"] as const;

export function RichTextHighlights({ activeSuggestionId, editor, suggestions }: RichTextHighlightsProps) {
  useEffect(() => {
    const registry = getHighlightRegistry();
    if (!editor || !registry) return;

    for (const name of HIGHLIGHT_NAMES) registry.delete(name);

    const grouped = {
      "harper-grammar": [] as Range[],
      "harper-punctuation": [] as Range[],
      "harper-spelling": [] as Range[],
      "harper-style": [] as Range[],
      "harper-readability": [] as Range[],
      "harper-active": [] as Range[]
    };

    for (const suggestion of suggestions) {
      const range = createDomRangeFromNormalizedOffsets(editor, suggestion.plainStart, suggestion.plainEnd);
      if (!range) continue;
      grouped[highlightNameForCategory(suggestion.category)].push(range.cloneRange());
      if (suggestion.id === activeSuggestionId || suggestion.groupId === activeSuggestionId) grouped["harper-active"].push(range.cloneRange());
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
  if (category === "punctuation") return "harper-punctuation";
  if (category === "spelling") return "harper-spelling";
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

function createDomRangeFromNormalizedOffsets(root: HTMLElement, start: number, end: number) {
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let cursor = 0;

  for (const child of Array.from(root.childNodes)) {
    collectTextNodes(child, nodes, cursor);
    cursor = nodes[nodes.length - 1]?.end ?? cursor;
    if (isBlockNode(child)) cursor += 2;
  }

  const startNode = nodes.find((item) => start >= item.start && start <= item.end);
  const endNode = nodes.find((item) => end >= item.start && end <= item.end) ?? nodes.find((item) => end === item.end);
  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(startNode.node, Math.max(start - startNode.start, 0));
  range.setEnd(endNode.node, Math.max(end - endNode.start, 0));
  return range;
}

function collectTextNodes(node: Node, nodes: Array<{ node: Text; start: number; end: number }>, start: number) {
  let cursor = start;
  if (node.nodeType === Node.TEXT_NODE) {
    const textNode = node as Text;
    const text = textNode.textContent ?? "";
    nodes.push({ node: textNode, start: cursor, end: cursor + text.length });
    return cursor + text.length;
  }

  for (const child of Array.from(node.childNodes)) {
    cursor = collectTextNodes(child, nodes, cursor);
  }
  return cursor;
}

function isBlockNode(node: Node) {
  return node instanceof HTMLElement && /^(p|h[1-6]|ul|ol|li|div)$/i.test(node.tagName);
}
