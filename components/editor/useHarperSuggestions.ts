"use client";

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SuggestionKind, type Lint, type Suggestion } from "harper.js";
import { getHarperLinter, warmHarperLinter } from "@/lib/editor/harper/client";
import { mapPlainSpanToMarkdownRange, normalizeMarkdownForHarper } from "@/lib/editor/harper/normalization";
import type { HarperSuggestionCategory, HarperTextMapping } from "@/lib/editor/harper/types";

export type ArticleViewMode = "rich" | "md" | "split";

export type HarperSuggestionItem = {
  id: string;
  hash: bigint;
  category: HarperSuggestionCategory;
  kind: string;
  message: string;
  problemText: string;
  replacementText: string | null;
  plainStart: number;
  plainEnd: number;
  markdownStart: number;
  markdownEnd: number;
  suggestionCount: number;
  lint: Lint;
  suggestions: Suggestion[];
};

type UseHarperSuggestionsParams = {
  articleId: string | null;
  markdown: string;
  viewMode: ArticleViewMode;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  richEditorRef: RefObject<HTMLDivElement | null>;
  onChange: (markdown: string) => void;
};

type HarperStatus = "idle" | "loading" | "ready" | "error";

type JumpTarget = {
  suggestionId?: string;
};

export function useHarperSuggestions({
  articleId,
  markdown,
  viewMode,
  textareaRef,
  richEditorRef,
  onChange
}: UseHarperSuggestionsParams) {
  const [status, setStatus] = useState<HarperStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<HarperSuggestionItem[]>([]);
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null);
  const markdownRef = useRef(markdown);
  const viewModeRef = useRef(viewMode);
  const analysisRevisionRef = useRef(0);
  const mappingRef = useRef<HarperTextMapping | null>(null);

  markdownRef.current = markdown;
  viewModeRef.current = viewMode;

  const runAnalysis = useCallback(async (sourceMarkdown: string, immediate = false) => {
    const revision = analysisRevisionRef.current + 1;
    analysisRevisionRef.current = revision;

    if (!articleId) {
      setSuggestions([]);
      setStatus("idle");
      setError(null);
      return;
    }

    const mapping = normalizeMarkdownForHarper(sourceMarkdown);
    mappingRef.current = mapping;

    if (!mapping.text.trim()) {
      setSuggestions([]);
      setStatus("idle");
      setError(null);
      return;
    }

    setStatus("loading");
    setError(null);

    const execute = async () => {
      try {
        const linter = await getHarperLinter();
        const lints = await linter.lint(mapping.text, { language: "plaintext", dedup: true });
        const nextSuggestions: HarperSuggestionItem[] = [];

        for (const lint of lints) {
          const span = lint.span();
          const markdownRange = mapPlainSpanToMarkdownRange(mapping, span.start, span.end);
          if (!markdownRange) continue;
          const hash = await linter.contextHash(mapping.text, lint);
          const lintSuggestions = lint.suggestions();
          nextSuggestions.push({
            id: `${hash.toString()}-${span.start}-${span.end}`,
            hash,
            category: categorizeLint(lint.lint_kind()),
            kind: lint.lint_kind(),
            message: lint.message(),
            problemText: lint.get_problem_text(),
            replacementText: lintSuggestions[0]?.get_replacement_text() ?? null,
            plainStart: span.start,
            plainEnd: span.end,
            markdownStart: markdownRange.start,
            markdownEnd: markdownRange.end,
            suggestionCount: lintSuggestions.length,
            lint,
            suggestions: lintSuggestions
          });
        }

        nextSuggestions.sort((left, right) => left.plainStart - right.plainStart || left.plainEnd - right.plainEnd);

        if (analysisRevisionRef.current !== revision) return;
        setSuggestions(nextSuggestions);
        setStatus("ready");
        setActiveSuggestionId((current) => nextSuggestions.some((item) => item.id === current) ? current : null);
      } catch (cause) {
        if (analysisRevisionRef.current !== revision) return;
        setStatus("error");
        setError(cause instanceof Error ? cause.message : "Unable to analyze writing suggestions.");
      }
    };

    if (immediate) {
      await execute();
      return;
    }

    window.setTimeout(() => {
      if (analysisRevisionRef.current !== revision) return;
      void execute();
    }, 900);
  }, [articleId]);

  useEffect(() => {
    if (!articleId) {
      setSuggestions([]);
      setStatus("idle");
      setActiveSuggestionId(null);
      return;
    }
    void warmHarperLinter();
    void runAnalysis(markdown);
  }, [articleId, markdown, runAnalysis]);

  const counts = useMemo(() => ({
    grammar: suggestions.filter((item) => item.category === "grammar").length,
    style: suggestions.filter((item) => item.category === "style").length,
    readability: suggestions.filter((item) => item.category === "readability").length
  }), [suggestions]);

  const acceptSuggestion = useCallback(async (suggestionId: string) => {
    const target = suggestions.find((item) => item.id === suggestionId);
    if (!target) return;
    const choice = target.suggestions[0];
    if (!choice) return;

    let nextMarkdown = markdownRef.current;
    const replacement = choice.get_replacement_text();
    if (choice.kind() === SuggestionKind.InsertAfter) {
      nextMarkdown = `${nextMarkdown.slice(0, target.markdownEnd)}${replacement}${nextMarkdown.slice(target.markdownEnd)}`;
    } else {
      nextMarkdown = `${nextMarkdown.slice(0, target.markdownStart)}${replacement}${nextMarkdown.slice(target.markdownEnd)}`;
    }

    onChange(nextMarkdown);
    setActiveSuggestionId(null);
  }, [onChange, suggestions]);

  const ignoreSuggestion = useCallback(async (suggestionId: string) => {
    const target = suggestions.find((item) => item.id === suggestionId);
    if (!target || !mappingRef.current) return;
    setSuggestions((current) => current.filter((item) => item.id !== suggestionId));
    if (activeSuggestionId === suggestionId) setActiveSuggestionId(null);
    const linter = await getHarperLinter();
    await linter.ignoreLintHash(target.hash);
    void runAnalysis(markdownRef.current, true);
  }, [activeSuggestionId, runAnalysis, suggestions]);

  const jumpToSuggestion = useCallback(({ suggestionId }: JumpTarget) => {
    const target = suggestions.find((item) => item.id === suggestionId);
    if (!target) return;
    setActiveSuggestionId(target.id);

    if (viewModeRef.current === "rich" && richEditorRef.current) {
      const range = createDomRangeFromOffsets(richEditorRef.current, target.plainStart, target.plainEnd);
      if (range) {
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        richEditorRef.current.focus();
        const container = range.startContainer.parentElement ?? richEditorRef.current;
        container.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
    }

    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(target.markdownStart, target.markdownEnd);
    const lineHeight = 32;
    const linesBefore = markdownRef.current.slice(0, target.markdownStart).split("\n").length - 1;
    textarea.scrollTo({ top: Math.max(linesBefore * lineHeight - lineHeight * 3, 0), behavior: "smooth" });
  }, [richEditorRef, suggestions, textareaRef]);

  return {
    activeSuggestionId,
    counts,
    error,
    hasSuggestions: suggestions.length > 0,
    status,
    suggestions,
    acceptSuggestion,
    ignoreSuggestion,
    jumpToSuggestion,
    selectSuggestion: setActiveSuggestionId
  };
}

function categorizeLint(kind: string): HarperSuggestionCategory {
  if (kind === "Readability") return "readability";
  if ([
    "Agreement",
    "BoundaryError",
    "Capitalization",
    "Grammar",
    "Punctuation",
    "Spelling",
    "Typo"
  ].includes(kind)) return "grammar";
  return "style";
}

function createDomRangeFromOffsets(root: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let cursor = 0;
  let current = walker.nextNode();

  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      const textNode = current as Text;
      const text = textNode.textContent ?? "";
      nodes.push({
        node: textNode,
        start: cursor,
        end: cursor + text.length
      });
      cursor += text.length;
    }
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
