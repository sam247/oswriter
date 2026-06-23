import type { ProjectDocument, ProjectKnowledgeBase } from "@/lib/types";

const BUILT_IN_TERMS = [
  "BYOK",
  "Disclosurely",
  "GA4",
  "GSC",
  "Next.js",
  "OpenRedaction",
  "PA23",
  "QueueWrite"
];

export function buildHarperProjectDictionary(project?: Pick<ProjectDocument, "name" | "slug" | "knowledgeBase" | "profile"> | null) {
  const terms = new Set<string>();

  for (const term of BUILT_IN_TERMS) addDictionaryTerm(terms, term);
  if (!project) return terms;

  addDictionaryTerm(terms, project.name);
  addDictionaryTerm(terms, project.slug);
  addDictionaryTerm(terms, project.profile?.industryLabel);
  addDictionaryTerm(terms, project.profile?.customIndustryLabel);
  addKnowledgeBaseTerms(terms, project.knowledgeBase);

  return terms;
}

export function isDictionaryTerm(value: string, dictionary: ReadonlySet<string>) {
  const normalized = normalizeDictionaryTerm(value);
  if (!normalized) return false;
  if (dictionary.has(normalized)) return true;

  const compact = normalized.replace(/\./g, "");
  return compact !== normalized && dictionary.has(compact);
}

function addKnowledgeBaseTerms(terms: Set<string>, knowledgeBase?: ProjectKnowledgeBase | null) {
  if (!knowledgeBase) return;
  addDictionaryTerm(terms, knowledgeBase.brandName);
  addDictionaryTerm(terms, knowledgeBase.services);
  addDictionaryTerm(terms, knowledgeBase.products);
  addDictionaryTerm(terms, knowledgeBase.aboutBusiness);
  addDictionaryTerm(terms, knowledgeBase.targetCustomer);
  addDictionaryTerm(terms, knowledgeBase.writingRules);
  addDictionaryTerm(terms, knowledgeBase.preferredCTA);
}

function addDictionaryTerm(terms: Set<string>, value?: string | null) {
  for (const token of extractDictionaryTokens(value)) {
    terms.add(token);
  }
}

function extractDictionaryTokens(value?: string | null) {
  if (!value) return [];
  const tokens = new Set<string>();
  const phrase = normalizeDictionaryTerm(value);
  if (phrase) tokens.add(phrase);

  for (const match of value.matchAll(/[A-Za-z][A-Za-z0-9.+#-]*|\b[A-Z0-9]{2,}\b/g)) {
    if (!isTermLike(match[0])) continue;
    const token = normalizeDictionaryTerm(match[0]);
    if (token && token.length > 1) tokens.add(token);
  }

  return [...tokens];
}

function normalizeDictionaryTerm(value: string) {
  return value
    .trim()
    .replace(/^[^\w.+#-]+|[^\w.+#-]+$/g, "")
    .toLowerCase();
}

function isTermLike(value: string) {
  return /[A-Z]{2,}/.test(value)
    || /\d/.test(value)
    || /[.+#-]/.test(value)
    || /[a-z][A-Z]/.test(value);
}
