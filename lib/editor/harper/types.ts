export type HarperSuggestionCategory = "grammar" | "style" | "readability";

export type HarperTextMapping = {
  text: string;
  plainToMarkdown: number[];
  markdownLength: number;
};

export type HarperMarkdownRange = {
  start: number;
  end: number;
};
