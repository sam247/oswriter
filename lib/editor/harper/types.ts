export type HarperSuggestionCategory = "grammar" | "spelling" | "style" | "readability" | "terminology";
export type HarperTelemetryCategory = "grammar" | "style" | "readability" | "spelling" | "usage";

export type HarperTextMapping = {
  text: string;
  plainToMarkdown: number[];
  markdownToPlain: Array<number | null>;
  markdownLength: number;
};

export type HarperMarkdownRange = {
  start: number;
  end: number;
};
