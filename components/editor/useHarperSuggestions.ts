"use client";

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SuggestionKind, type Lint, type Suggestion } from "harper.js";
import type { HarperTelemetryAction, HarperTelemetryEventInput } from "@/lib/analytics/harper";
import { getHarperLinter, warmHarperLinter } from "@/lib/editor/harper/client";
import { buildHarperProjectDictionary, isDictionaryTerm } from "@/lib/editor/harper/dictionary";
import { HARPER_CATEGORY_ORDER, isActionableHarperReplacement, shouldSurfaceHarperSuggestion } from "@/lib/editor/harper/filtering";
import { mapMarkdownRangeToPlainSpan, mapPlainSpanToMarkdownRange, normalizeMarkdownForHarper } from "@/lib/editor/harper/normalization";
import type { HarperSuggestionCategory, HarperTelemetryCategory, HarperTextMapping } from "@/lib/editor/harper/types";
import type { ProjectDocument } from "@/lib/types";

export type ArticleViewMode = "rich" | "md" | "split";

export type HarperSuggestionItem = {
  id: string;
  hash: bigint;
  category: HarperSuggestionCategory;
  telemetryCategory: HarperTelemetryCategory;
  ruleId: string;
  kind: string;
  message: string;
  problemText: string;
  replacementText: string | null;
  plainStart: number;
  plainEnd: number;
  markdownStart: number;
  markdownEnd: number;
  suggestionCount: number;
  occurrenceCount: number;
  occurrences: HarperSuggestionOccurrence[];
  lint: Lint;
  suggestions: Suggestion[];
};

export type HarperSuggestionOccurrence = {
  id: string;
  hash: bigint;
  plainStart: number;
  plainEnd: number;
  markdownStart: number;
  markdownEnd: number;
  problemText: string;
  lint: Lint;
  suggestions: Suggestion[];
};

type UseHarperSuggestionsParams = {
  articleId: string | null;
  contentProfile?: string | null;
  markdown: string;
  project?: Pick<ProjectDocument, "name" | "slug" | "knowledgeBase" | "profile" | "projectDictionaryTerms"> | null;
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
  contentProfile,
  markdown,
  project,
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
  const visibleSuggestionIdsRef = useRef<Set<string>>(new Set());
  const dictionary = useMemo(() => buildHarperProjectDictionary(project), [project]);

  markdownRef.current = markdown;
  viewModeRef.current = viewMode;

  const recordTelemetry = useCallback((events: HarperTelemetryEventInput[]) => {
    if (!events.length) return;
    void fetch("/api/analytics/harper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive: true
    }).catch(() => {
      // Telemetry must stay invisible to the editing experience.
    });
  }, []);

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
        const lintGroups = await linter.organizedLints(mapping.text, { language: "plaintext", dedup: true });
        const rawSuggestions: HarperSuggestionItem[] = [];
        let totalIssuesFound = 0;

        for (const [ruleId, lints] of Object.entries(lintGroups)) {
          for (const lint of lints) {
            totalIssuesFound += 1;
            const span = lint.span();
            const alignedSpan = alignLintSpan(mapping.text, span.start, span.end, lint.get_problem_text());
            const markdownRange = mapPlainSpanToMarkdownRange(mapping, alignedSpan.start, alignedSpan.end);
            if (!markdownRange) continue;
            const exactPlainSpan = mapMarkdownRangeToPlainSpan(mapping, markdownRange.start, markdownRange.end) ?? alignedSpan;
            const hash = await linter.contextHash(mapping.text, lint);
            const lintSuggestions = lint.suggestions();
            const problemText = mapping.text.slice(exactPlainSpan.start, exactPlainSpan.end) || lint.get_problem_text();
            const category = categorizeLint(lint.lint_kind(), lint.message(), problemText, lintSuggestions);
            const replacementCandidate = lintSuggestions[0]?.get_replacement_text()?.trim() ?? null;
            const filteringInput = {
              category,
              dictionary,
              kind: lint.lint_kind(),
              message: lint.message(),
              problemText,
              replacementText: replacementCandidate
            };
            if (isDictionaryTerm(problemText, dictionary) || !shouldSurfaceHarperSuggestion(filteringInput)) continue;
            const replacementText = isActionableHarperReplacement(filteringInput) ? replacementCandidate : null;

            rawSuggestions.push({
              id: `${ruleId}:${hash.toString()}-${exactPlainSpan.start}-${exactPlainSpan.end}`,
              hash,
              category,
              telemetryCategory: telemetryCategoryForLint(lint.lint_kind()),
              ruleId,
              kind: lint.lint_kind(),
              message: normalizeIssueTitle(lint.message(), category),
              problemText,
              replacementText,
              plainStart: exactPlainSpan.start,
              plainEnd: exactPlainSpan.end,
              markdownStart: markdownRange.start,
              markdownEnd: markdownRange.end,
              suggestionCount: replacementText ? lintSuggestions.length : 0,
              occurrenceCount: 1,
              occurrences: [{
                id: `${ruleId}:${hash.toString()}-${exactPlainSpan.start}-${exactPlainSpan.end}`,
                hash,
                plainStart: exactPlainSpan.start,
                plainEnd: exactPlainSpan.end,
                markdownStart: markdownRange.start,
                markdownEnd: markdownRange.end,
                problemText,
                lint,
                suggestions: lintSuggestions
              }],
              lint,
              suggestions: lintSuggestions
            });
          }
        }

        const nextSuggestions = groupDuplicateSuggestions(rawSuggestions);
        nextSuggestions.sort((left, right) => compareSuggestionPriority(left, right));
        console.info("harper_suppression_metrics", {
          totalIssuesFound,
          issuesSuppressed: Math.max(totalIssuesFound - nextSuggestions.length, 0),
          issuesDisplayed: nextSuggestions.length
        });

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
  }, [articleId, dictionary]);

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

  useEffect(() => {
    visibleSuggestionIdsRef.current.clear();
  }, [articleId]);

  useEffect(() => {
    if (!articleId || !suggestions.length) {
      visibleSuggestionIdsRef.current = new Set();
      return;
    }
    const previouslyVisible = visibleSuggestionIdsRef.current;
    const currentVisible = new Set(suggestions.map((item) => item.id));
    const entering = suggestions.filter((item) => !previouslyVisible.has(item.id));
    visibleSuggestionIdsRef.current = currentVisible;
    if (!entering.length) return;
    recordTelemetry(entering.map((item) => buildTelemetryEvent(item, articleId, contentProfile, "shown")));
  }, [articleId, contentProfile, recordTelemetry, suggestions]);

  const counts = useMemo(() => ({
    grammar: suggestions.filter((item) => item.category === "grammar").length,
    punctuation: suggestions.filter((item) => item.category === "punctuation").length,
    spelling: suggestions.filter((item) => item.category === "spelling").length,
    style: suggestions.filter((item) => item.category === "style").length,
    readability: suggestions.filter((item) => item.category === "readability").length
  }), [suggestions]);

  const acceptSuggestion = useCallback(async (suggestionId: string) => {
    const target = suggestions.find((item) => item.id === suggestionId);
    if (!target) return;
    const nextMarkdown = applySuggestionOccurrences(markdownRef.current, target.occurrences);
    if (nextMarkdown === markdownRef.current) return;

    recordTelemetry([buildTelemetryEvent(target, articleId, contentProfile, "accepted")]);
    onChange(nextMarkdown);
    setActiveSuggestionId(null);
  }, [articleId, contentProfile, onChange, recordTelemetry, suggestions]);

  const ignoreSuggestion = useCallback(async (suggestionId: string) => {
    const target = suggestions.find((item) => item.id === suggestionId);
    if (!target || !mappingRef.current) return;
    recordTelemetry([buildTelemetryEvent(target, articleId, contentProfile, "ignored")]);
    setSuggestions((current) => current.filter((item) => item.id !== suggestionId));
    if (activeSuggestionId === suggestionId) setActiveSuggestionId(null);
    const linter = await getHarperLinter();
    await Promise.all(target.occurrences.map((occurrence) => linter.ignoreLintHash(occurrence.hash)));
    void runAnalysis(markdownRef.current, true);
  }, [activeSuggestionId, articleId, contentProfile, recordTelemetry, runAnalysis, suggestions]);

  const acceptCategory = useCallback((category: HarperSuggestionCategory) => {
    const targets = suggestions.filter((item) => item.category === category && item.replacementText);
    if (!targets.length) return;
    const nextMarkdown = applySuggestionOccurrences(markdownRef.current, targets.flatMap((item) => item.occurrences));
    if (nextMarkdown === markdownRef.current) return;
    recordTelemetry(targets.map((target) => buildTelemetryEvent(target, articleId, contentProfile, "accepted")));
    onChange(nextMarkdown);
    setActiveSuggestionId(null);
  }, [articleId, contentProfile, onChange, recordTelemetry, suggestions]);

  const ignoreCategory = useCallback(async (category: HarperSuggestionCategory) => {
    const targets = suggestions.filter((item) => item.category === category);
    if (!targets.length) return;
    recordTelemetry(targets.map((target) => buildTelemetryEvent(target, articleId, contentProfile, "ignored")));
    setSuggestions((current) => current.filter((item) => item.category !== category));
    if (activeSuggestionId && targets.some((item) => item.id === activeSuggestionId)) setActiveSuggestionId(null);
    const linter = await getHarperLinter();
    await Promise.all(targets.flatMap((target) => target.occurrences).map((occurrence) => linter.ignoreLintHash(occurrence.hash)));
    void runAnalysis(markdownRef.current, true);
  }, [activeSuggestionId, articleId, contentProfile, recordTelemetry, runAnalysis, suggestions]);

  const jumpToSuggestion = useCallback(({ suggestionId }: JumpTarget) => {
    const target = suggestions.find((item) => item.id === suggestionId);
    if (!target) return;
    setActiveSuggestionId(target.id);

    if (viewModeRef.current === "rich" && richEditorRef.current) {
      const range = createDomRangeFromNormalizedOffsets(richEditorRef.current, target.plainStart, target.plainEnd);
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
    visibleSuggestions: suggestions.flatMap((suggestion) => suggestion.occurrences.map((occurrence) => ({
      id: occurrence.id,
      groupId: suggestion.id,
      category: suggestion.category,
      plainStart: occurrence.plainStart,
      plainEnd: occurrence.plainEnd,
      markdownStart: occurrence.markdownStart,
      markdownEnd: occurrence.markdownEnd
    }))),
    acceptSuggestion,
    ignoreSuggestion,
    acceptCategory,
    ignoreCategory,
    jumpToSuggestion,
    selectSuggestion: setActiveSuggestionId
  };
}

function categorizeLint(kind: string, _message = "", _problemText = "", _suggestions: Suggestion[] = []): HarperSuggestionCategory {
  if (kind === "Readability") return "readability";
  if (kind === "Punctuation") return "punctuation";
  if (kind === "Spelling" || kind === "Typo") return "spelling";
  if ([
    "Agreement",
    "BoundaryError",
    "Capitalization",
    "Grammar"
  ].includes(kind)) return "grammar";
  return "style";
}

function alignLintSpan(text: string, start: number, end: number, problemText: string) {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  const normalizedProblem = problemText.trim();

  if (normalizedProblem) {
    const searchStart = Math.max(0, safeStart - 40);
    const searchEnd = Math.min(text.length, safeEnd + 40);
    const nearby = text.slice(searchStart, searchEnd);
    const exactIndex = nearby.indexOf(normalizedProblem);
    if (exactIndex >= 0) {
      return {
        start: searchStart + exactIndex,
        end: searchStart + exactIndex + normalizedProblem.length
      };
    }
  }

  return expandToWordBoundary(text, safeStart, safeEnd);
}

function expandToWordBoundary(text: string, start: number, end: number) {
  let nextStart = start;
  let nextEnd = end;
  while (nextStart > 0 && isWordCharacter(text[nextStart - 1]) && isWordCharacter(text[nextStart])) nextStart -= 1;
  while (nextEnd < text.length && isWordCharacter(text[nextEnd - 1]) && isWordCharacter(text[nextEnd])) nextEnd += 1;
  return { start: nextStart, end: nextEnd };
}

function isWordCharacter(character = "") {
  return /[\p{L}\p{N}'-]/u.test(character);
}

function groupDuplicateSuggestions(items: HarperSuggestionItem[]) {
  const grouped = new Map<string, HarperSuggestionItem>();

  for (const item of items) {
    const key = [
      item.category,
      item.message.toLowerCase(),
      item.problemText.toLowerCase(),
      item.replacementText?.toLowerCase() ?? ""
    ].join("\u0000");
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, item);
      continue;
    }

    existing.occurrences.push(...item.occurrences);
    existing.occurrenceCount = existing.occurrences.length;
    existing.plainStart = Math.min(existing.plainStart, item.plainStart);
    existing.plainEnd = existing.plainStart === item.plainStart ? item.plainEnd : existing.plainEnd;
    existing.markdownStart = Math.min(existing.markdownStart, item.markdownStart);
    existing.markdownEnd = existing.markdownStart === item.markdownStart ? item.markdownEnd : existing.markdownEnd;
  }

  return [...grouped.values()].map((item) => {
    const occurrences = item.occurrences.sort((left, right) => left.markdownStart - right.markdownStart || left.markdownEnd - right.markdownEnd);
    const first = occurrences[0];
    return {
      ...item,
      hash: first.hash,
      plainStart: first.plainStart,
      plainEnd: first.plainEnd,
      markdownStart: first.markdownStart,
      markdownEnd: first.markdownEnd,
      occurrences,
      occurrenceCount: occurrences.length
    };
  });
}

function applySuggestionOccurrences(markdown: string, occurrences: HarperSuggestionOccurrence[]) {
  let nextMarkdown = markdown;
  const ordered = [...occurrences]
    .map((occurrence) => ({ occurrence, choice: occurrence.suggestions[0] }))
    .filter((item): item is { occurrence: HarperSuggestionOccurrence; choice: Suggestion } => Boolean(item.choice))
    .sort((left, right) => right.occurrence.markdownStart - left.occurrence.markdownStart);

  for (const { occurrence, choice } of ordered) {
    const replacement = choice.get_replacement_text();
    if (choice.kind() === SuggestionKind.InsertAfter) {
      nextMarkdown = `${nextMarkdown.slice(0, occurrence.markdownEnd)}${replacement}${nextMarkdown.slice(occurrence.markdownEnd)}`;
    } else {
      nextMarkdown = `${nextMarkdown.slice(0, occurrence.markdownStart)}${replacement}${nextMarkdown.slice(occurrence.markdownEnd)}`;
    }
  }

  return nextMarkdown;
}

function normalizeIssueTitle(message: string, category: HarperSuggestionCategory) {
  const cleanMessage = message.replace(/\s+/g, " ").trim();
  if (cleanMessage.length <= 80) return cleanMessage;
  return `${cleanMessage.slice(0, 77)}...`;
}

function telemetryCategoryForLint(kind: string): HarperTelemetryCategory {
  if (kind === "Readability") return "readability";
  if (kind === "Spelling" || kind === "Typo") return "spelling";
  if (kind === "Capitalization" || kind === "RepeatedWords" || kind === "WordChoice" || kind === "Usage") return "usage";
  if (categorizeLint(kind) === "style") return "style";
  return "grammar";
}

function compareSuggestionPriority(left: HarperSuggestionItem, right: HarperSuggestionItem) {
  const leftPriority = HARPER_CATEGORY_ORDER.indexOf(left.category);
  const rightPriority = HARPER_CATEGORY_ORDER.indexOf(right.category);
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  if (left.occurrenceCount !== right.occurrenceCount) return right.occurrenceCount - left.occurrenceCount;
  return left.plainStart - right.plainStart || left.plainEnd - right.plainEnd;
}

function buildTelemetryEvent(
  suggestion: HarperSuggestionItem,
  articleId: string | null,
  contentProfile: string | null | undefined,
  action: HarperTelemetryAction
): HarperTelemetryEventInput {
  return {
    article_id: articleId ?? "",
    content_profile: contentProfile ?? null,
    rule_id: suggestion.ruleId,
    suggestion_id: suggestion.id,
    category: suggestion.telemetryCategory,
    action,
    timestamp: new Date().toISOString()
  };
}

function createDomRangeFromNormalizedOffsets(root: HTMLElement, start: number, end: number) {
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let cursor = 0;

  for (const child of Array.from(root.childNodes)) {
    cursor = collectTextNodes(child, nodes, cursor);
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
