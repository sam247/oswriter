import type { HarperMarkdownRange, HarperTextMapping } from "@/lib/editor/harper/types";

export function normalizeMarkdownForHarper(markdown: string): HarperTextMapping {
  const plainToMarkdown: number[] = [];
  let text = "";
  let index = 0;
  let lineStart = true;

  while (index < markdown.length) {
    if (lineStart) {
      const headingPrefix = matchHeadingPrefix(markdown, index);
      if (headingPrefix > 0) {
        index += headingPrefix;
        lineStart = false;
        continue;
      }
      const listPrefix = matchListPrefix(markdown, index);
      if (listPrefix > 0) {
        index += listPrefix;
        lineStart = false;
        continue;
      }
    }

    if (markdown[index] === "\n") {
      text += "\n";
      plainToMarkdown.push(index);
      index += 1;
      lineStart = true;
      continue;
    }

    const link = matchMarkdownLink(markdown, index);
    if (link) {
      for (let offset = 0; offset < link.label.length; offset += 1) {
        text += link.label[offset];
        plainToMarkdown.push(link.labelStart + offset);
      }
      index = link.end;
      lineStart = false;
      continue;
    }

    const strongMarker = markdown.slice(index, index + 2);
    if (strongMarker === "**" || strongMarker === "__") {
      index += 2;
      continue;
    }

    const marker = markdown[index];
    if (marker === "*" || marker === "_") {
      index += 1;
      continue;
    }

    text += marker;
    plainToMarkdown.push(index);
    index += 1;
    lineStart = false;
  }

  return {
    text,
    plainToMarkdown,
    markdownLength: markdown.length
  };
}

export function mapPlainSpanToMarkdownRange(mapping: HarperTextMapping, start: number, end: number): HarperMarkdownRange | null {
  if (!mapping.text.length || end <= start) return null;
  const safeStart = clamp(start, 0, mapping.text.length - 1);
  const safeEnd = clamp(end - 1, 0, mapping.text.length - 1);
  const markdownStart = mapping.plainToMarkdown[safeStart];
  const markdownEnd = mapping.plainToMarkdown[safeEnd] + 1;
  if (markdownStart === undefined || markdownEnd === undefined) return null;
  return {
    start: markdownStart,
    end: Math.max(markdownStart, markdownEnd)
  };
}

function matchHeadingPrefix(markdown: string, index: number) {
  let cursor = index;
  while (markdown[cursor] === "#") cursor += 1;
  if (cursor === index || cursor - index > 6) return 0;
  if (markdown[cursor] !== " ") return 0;
  return cursor - index + 1;
}

function matchListPrefix(markdown: string, index: number) {
  if ((markdown[index] === "-" || markdown[index] === "*") && markdown[index + 1] === " ") return 2;
  let cursor = index;
  while (/\d/.test(markdown[cursor] ?? "")) cursor += 1;
  if (cursor === index || markdown[cursor] !== "." || markdown[cursor + 1] !== " ") return 0;
  return cursor - index + 2;
}

function matchMarkdownLink(markdown: string, index: number) {
  if (markdown[index] !== "[") return null;
  const labelEnd = markdown.indexOf("]", index + 1);
  if (labelEnd === -1 || markdown[labelEnd + 1] !== "(") return null;
  const urlEnd = markdown.indexOf(")", labelEnd + 2);
  if (urlEnd === -1) return null;
  return {
    label: markdown.slice(index + 1, labelEnd),
    labelStart: index + 1,
    end: urlEnd + 1
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
