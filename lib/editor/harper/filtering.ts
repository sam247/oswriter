import type { HarperSuggestionCategory } from "@/lib/editor/harper/types";
import { isDictionaryTerm } from "@/lib/editor/harper/dictionary";

export const HARPER_CATEGORY_ORDER: HarperSuggestionCategory[] = ["grammar", "punctuation", "spelling", "style", "readability"];

type HarperSuggestionFilteringInput = {
  category: HarperSuggestionCategory;
  dictionary: ReadonlySet<string>;
  kind: string;
  message: string;
  problemText: string;
  replacementText: string | null;
};

const CATEGORY_THRESHOLDS: Record<HarperSuggestionCategory, number> = {
  grammar: 0.01,
  punctuation: 0.01,
  spelling: 0.9,
  style: 0.65,
  readability: 0.6
};

export function shouldSurfaceHarperSuggestion(input: HarperSuggestionFilteringInput) {
  return getHarperSuggestionConfidence(input) >= CATEGORY_THRESHOLDS[input.category];
}

export function isActionableHarperReplacement(input: HarperSuggestionFilteringInput) {
  if (!input.replacementText?.trim()) return false;
  return getHarperSuggestionConfidence(input) >= CATEGORY_THRESHOLDS[input.category];
}

export function getHarperSuggestionConfidence({
  category,
  dictionary,
  kind,
  message,
  problemText,
  replacementText
}: HarperSuggestionFilteringInput) {
  const source = problemText.trim();
  const replacement = replacementText?.trim() ?? null;
  if (!source || source.length < 2) return 0;

  const dictionaryMatch = isDictionaryTerm(source, dictionary);
  const lexicalCategory = category === "spelling" || category === "style" || category === "readability";
  const spellingLikeKind = kind === "Spelling" || kind === "Typo" || kind === "Capitalization";

  if ((dictionaryMatch && (lexicalCategory || spellingLikeKind)) || isSuppressedTokenShape(source, category, kind)) return 0;
  if (replacement && isLowTrustReplacement(source, replacement)) return 0;

  if (category === "grammar" || category === "punctuation") return 1;
  if (category === "readability") return replacement ? 0.72 : 0.64;
  if (category === "style") return scoreStyleConfidence(source, replacement, message);
  return scoreSpellingConfidence(source, replacement);
}

function scoreSpellingConfidence(source: string, replacement: string | null) {
  if (!replacement) return 0;
  if (looksLikeProtectedName(source)) return 0;
  if (!isPlainWord(source) || !isPlainWord(replacement)) return 0;

  const normalizedSource = source.toLowerCase();
  const normalizedReplacement = replacement.toLowerCase();
  const distance = levenshteinDistance(normalizedSource, normalizedReplacement);
  const maxLength = Math.max(normalizedSource.length, normalizedReplacement.length);
  if (distance === 0) return 0;
  if (maxLength <= 4) return distance === 1 ? 0.93 : 0.15;
  if (maxLength <= 8) return distance === 1 ? 0.97 : distance === 2 ? 0.91 : 0.2;
  return distance === 1 ? 0.98 : distance === 2 ? 0.93 : distance === 3 ? 0.45 : 0.15;
}

function scoreStyleConfidence(source: string, replacement: string | null, message: string) {
  if (looksLikeProtectedName(source)) return 0;
  if (!replacement) return /repeated|passive|awkward|wordy|concise|simplif|weak|readability/i.test(message) ? 0.68 : 0.45;
  if (isSplitWordEquivalent(source, replacement)) return 0;
  if (source.toLowerCase() === replacement.toLowerCase()) return 0;
  return 0.76;
}

function isSuppressedTokenShape(source: string, category: HarperSuggestionCategory, kind: string) {
  if (category === "grammar" || category === "punctuation") return false;
  if (looksLikeUrl(source) || looksLikeEmail(source) || looksLikeDomain(source)) return true;
  if (kind !== "Spelling" && kind !== "Typo" && kind !== "Capitalization" && category !== "style") return false;
  return looksLikeTechnicalToken(source) || looksLikeProtectedName(source);
}

function isLowTrustReplacement(source: string, replacement: string) {
  if (!replacement) return true;
  if (source.toLowerCase() === replacement.toLowerCase()) return true;
  if (isSplitWordEquivalent(source, replacement)) return true;
  if (/\d/.test(source) && !/\d/.test(replacement)) return true;
  if (/[A-Z]/.test(source) && replacement === replacement.toLowerCase()) return true;
  if (looksLikeTechnicalToken(source) && !looksLikeTechnicalToken(replacement) && /^[A-Za-z ]+$/.test(replacement)) return true;
  return false;
}

function isSplitWordEquivalent(source: string, replacement: string) {
  return !/\s/.test(source) && /\s/.test(replacement) && source.replace(/\s+/g, "").toLowerCase() === replacement.replace(/\s+/g, "").toLowerCase();
}

function isPlainWord(value: string) {
  return /^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(value);
}

function looksLikeProtectedName(value: string) {
  return /[A-Z].*[A-Z]/.test(value) || /^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(value) || /^[A-Z][a-z0-9.+#-]{2,}$/.test(value);
}

function looksLikeTechnicalToken(value: string) {
  return /[A-Za-z]+\d|\d+[A-Za-z]/.test(value)
    || /[.+#/_-]/.test(value)
    || /^[A-Z0-9]{2,}$/.test(value)
    || /\d/.test(value);
}

function looksLikeUrl(value: string) {
  return /^(https?:\/\/|www\.)/i.test(value);
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function looksLikeDomain(value: string) {
  return /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(value);
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    let last = leftIndex;
    previous[0] = leftIndex + 1;

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const old = previous[rightIndex + 1];
      const cost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      previous[rightIndex + 1] = Math.min(
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + 1,
        last + cost
      );
      last = old;
    }
  }

  return previous[right.length];
}
