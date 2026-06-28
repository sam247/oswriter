import { businessCoverageItems, calculateKnowledgeCoverage, semanticCoverageItems } from "@/lib/knowledge-engine";
import type { ArticleDocument, KnowledgeCoverageResult, ProjectProfile, ProjectSiteProfileDocument, ResearchPack, SiteKnowledgePageDocument } from "@/lib/types";

export type SeoRecommendationSection = "fix" | "improve" | "project";

export interface SeoInternalLinkOpportunity {
  url: string;
  title: string;
  anchorText: string;
  reason: string;
  confidence: number;
  matchType: "topic" | "service" | "location" | "partial";
}

export interface SeoRecommendation {
  id: string;
  section: SeoRecommendationSection;
  title: string;
  reason: string;
  actionLabel: string;
  impact: number;
  priority: number;
  currentText: string;
  proposedText: string;
  difference: string;
  apply: (markdown: string) => string;
  metadata?: Record<string, unknown>;
}

export interface SeoDecisionResult {
  score: number;
  targetScore: number;
  estimatedImpact: number;
  recommendations: SeoRecommendation[];
}

interface SeoDecisionInput {
  article: ArticleDocument;
  markdown: string;
  research?: ResearchPack | null;
  profile?: ProjectProfile | null;
  sitePages?: SiteKnowledgePageDocument[];
  siteProfile?: ProjectSiteProfileDocument | null;
}

type FaqCoverageStatus = "missing" | "partial" | "complete";
type LinkOpportunityMatchType = SeoInternalLinkOpportunity["matchType"];
type InternalLinkOpportunity = SeoInternalLinkOpportunity;

const RECOMMENDATION_CONFIDENCE_THRESHOLD = 0.7;

export function buildSeoDecisionEngine({ article, markdown, research, profile, sitePages = [], siteProfile = null }: SeoDecisionInput): SeoDecisionResult {
  const recommendations = [
    ...buildFixRecommendations(article, markdown, profile),
    ...buildImproveRecommendations(article, markdown, research, profile),
    ...buildKnowledgeGraphRecommendations(article, markdown, research, siteProfile),
    ...buildProjectRecommendations(markdown, profile),
    ...buildInternalLinkRecommendations(markdown, sitePages, siteProfile, profile)
  ].sort((left, right) => right.priority - left.priority || right.impact - left.impact);
  const score = Math.max(0, 100 - recommendations.reduce((sum, item) => sum + item.impact, 0));
  const estimatedImpact = recommendations.slice(0, 3).reduce((sum, item) => sum + item.impact, 0);

  return {
    score,
    targetScore: Math.min(100, score + estimatedImpact),
    estimatedImpact,
    recommendations
  };
}

function buildKnowledgeGraphRecommendations(article: ArticleDocument, markdown: string, research?: ResearchPack | null, siteProfile?: ProjectSiteProfileDocument | null) {
  const recommendations: SeoRecommendation[] = [];
  const businessCoverage = article.validation.businessCoverage
    ?? calculateKnowledgeCoverage(markdown, businessCoverageItems(siteProfile?.businessIntelligence), "Business opportunity");
  const semanticCoverage = article.validation.semanticCoverage
    ?? calculateKnowledgeCoverage(markdown, semanticCoverageItems(research?.semanticIntelligence), "Semantic opportunity");

  if (shouldRecommendCoverage(businessCoverage)) {
    const suggestions = businessCoverage.missing.slice(0, 3);
    recommendations.push(createAppendRecommendation({
      id: "add-business-evidence",
      section: "improve",
      title: "Business evidence could work harder",
      reason: `${businessCoverage.available.length} business intelligence signal${businessCoverage.available.length === 1 ? "" : "s"} are available; ${suggestions.length} could support this article if they fit naturally: ${suggestions.join(", ")}.`,
      actionLabel: "Add Evidence",
      impact: 3,
      priority: 86,
      markdown,
      block: `## Why This Matters\n\nRelevant business evidence can help readers judge fit and credibility. Where it fits the article, consider referencing ${suggestions.join(", ")} without turning the section into a sales pitch.`
    }));
  }

  if (shouldRecommendCoverage(semanticCoverage, 8, 5)) {
    const suggestions = semanticCoverage.missing.slice(0, 5);
    recommendations.push(createAppendRecommendation({
      id: "expand-semantic-coverage",
      section: "improve",
      title: "Topic coverage is missing concepts",
      reason: `The semantic graph found ${semanticCoverage.available.length} expected concepts; these are not covered clearly enough: ${suggestions.join(", ")}.`,
      actionLabel: "Expand Concepts",
      impact: 4,
      priority: 89,
      markdown,
      block: `## Additional Concepts To Address\n\nTo improve topical completeness, add concise coverage of ${suggestions.join(", ")} where it helps the reader. Treat these as concepts to explain, not keywords to repeat.`
    }));
  }

  return recommendations;
}

function shouldRecommendCoverage(coverage: KnowledgeCoverageResult, minimumAvailable = 3, minimumMissing = 2) {
  return coverage.available.length >= minimumAvailable && coverage.missing.length >= minimumMissing;
}

export function applySeoRecommendations(markdown: string, recommendations: SeoRecommendation[]) {
  return recommendations.reduce((next, recommendation) => recommendation.apply(next), markdown);
}

export function applySelectedInternalLinks(markdown: string, opportunities: SeoInternalLinkOpportunity[]) {
  return insertInternalLinks(markdown, opportunities).markdown;
}

function buildFixRecommendations(article: ArticleDocument, markdown: string, profile?: ProjectProfile | null) {
  const recommendations: SeoRecommendation[] = [];
  const topic = article.title.replace(/[?.!]+$/, "");
  const faqCoverage = classifyFaqCoverage(markdown);
  const editorialStandards = new Set(profile?.editorialStandards ?? []);

  if (faqCoverage.status !== "complete" && faqCoverage.confidence >= RECOMMENDATION_CONFIDENCE_THRESHOLD) {
    const block = `## FAQ\n\n### What should readers know first about ${topic}?\nThe most important starting point is to understand the practical constraints, evidence, and decisions that shape the outcome.\n\n### What commonly causes problems with ${topic}?\nProblems usually arise when assumptions are not checked early, responsibilities are unclear, or evidence is considered too late.\n\n### What should readers do next?\nReview the current requirements, verify the supporting evidence, and turn the findings into a clear next action.`;
    recommendations.push(createAppendRecommendation({
      id: "add-faq",
      section: "fix",
      title: faqCoverage.status === "partial" ? "FAQ coverage could be expanded" : "No FAQ section detected",
      reason: faqCoverage.status === "partial"
        ? `${faqCoverage.questionHeadingCount} question-style heading${faqCoverage.questionHeadingCount === 1 ? " is" : "s are"} present, but the article needs a fuller answer-ready FAQ cluster.`
        : editorialStandards.has("include_faqs")
          ? "Project editorial standards call for an FAQ section when appropriate, and none is currently present."
          : "A focused FAQ adds answer-ready coverage for long-tail searches and featured snippets.",
      actionLabel: "Apply FAQ",
      impact: faqCoverage.status === "partial" ? 2 : 4,
      priority: faqCoverage.status === "partial" ? 88 : editorialStandards.has("include_faqs") ? 100 : 96,
      markdown,
      block
    }));
  }

  if (!hasCallToAction(markdown)) {
    const audience = profile?.audienceLabel ?? "readers";
    const block = `## Next Step\n\n${audience} should use the evidence in this guide to review the current position, confirm the key requirements, and choose the next practical action.`;
    recommendations.push(createAppendRecommendation({
      id: "add-cta",
      section: "fix",
      title: "No clear next action detected",
      reason: editorialStandards.has("actionable_recommendations")
        ? "Project editorial standards call for actionable recommendations, but the draft does not finish with a clear next step."
        : "The article explains the topic but does not tell the reader what to do after reading it.",
      actionLabel: "Apply CTA",
      impact: 3,
      priority: editorialStandards.has("actionable_recommendations") ? 97 : 95,
      markdown,
      block
    }));
  }

  if (article.sources.length > 0 && !hasOutboundCitation(markdown)) {
    recommendations.push(createSourceCitationRecommendation({
      article,
      markdown,
      sources: article.sources
    }));
  }

  if (article.sources.length > 0 && !hasReferencesSection(markdown)) {
    recommendations.push(createCitationListRecommendation({
      markdown,
      sources: article.sources
    }));
  }

  if (!/^##\s+(?:Conclusion|Summary|Final Thoughts|Key Takeaways)\b/im.test(markdown)) {
    const block = `## Conclusion\n\n${topic} becomes easier to act on when readers connect the evidence to the practical constraints, verify the assumptions, and turn the findings into a clear decision.`;
    recommendations.push(createAppendRecommendation({
      id: "add-conclusion",
      section: "fix",
      title: "Missing conclusion",
      reason: "The article ends without consolidating the evidence into a clear takeaway.",
      actionLabel: "Apply Conclusion",
      impact: 3,
      priority: 90,
      markdown,
      block
    }));
  }

  return recommendations.slice(0, 5);
}

function createSourceCitationRecommendation({ article, markdown, sources }: { article: ArticleDocument; markdown: string; sources: ArticleDocument["sources"] }): SeoRecommendation {
  const insertion = planSourceCitations(article, markdown, sources);
  return {
    id: "cite-sources",
    section: "fix",
    title: "No sources cited in the article",
    reason: `${sources.length} accepted sources are available, but readers cannot verify claims from the draft.`,
    actionLabel: "Insert Sources",
    impact: 4,
    priority: 98,
    currentText: insertion.currentText,
    proposedText: insertion.proposedText,
    difference: createInlineDifference(insertion.currentText, insertion.proposedText),
    apply: (currentMarkdown) => planSourceCitations(article, currentMarkdown, sources).markdown
  };
}

function createCitationListRecommendation({ markdown, sources }: { markdown: string; sources: ArticleDocument["sources"] }): SeoRecommendation {
  const insertion = planCitationListInsertion(markdown, sources);
  return {
    id: "insert-citation-list",
    section: "fix",
    title: "No reference list detected",
    reason: `${insertion.sourceCount} gathered source${insertion.sourceCount === 1 ? " is" : "s are"} available for a publisher-ready reference list.`,
    actionLabel: "Insert Citation List",
    impact: 3,
    priority: 89,
    currentText: "No References section is present in the current draft.",
    proposedText: insertion.block,
    difference: insertion.block.split("\n").map((line) => `+ ${line}`).join("\n"),
    apply: (currentMarkdown) => planCitationListInsertion(currentMarkdown, sources).markdown
  };
}

function buildImproveRecommendations(article: ArticleDocument, markdown: string, research?: ResearchPack | null, profile?: ProjectProfile | null) {
  const recommendations: SeoRecommendation[] = [];
  const unusedFacts = (research?.usefulFacts ?? []).filter((fact) => !containsFact(markdown, fact));
  const unusedStatistics = unusedFacts.filter(isQuantifiedFinding);
  const unusedFindings = unusedFacts.filter((fact) => !isQuantifiedFinding(fact));
  const editorialStandards = new Set(profile?.editorialStandards ?? []);

  if (unusedStatistics.length > 0) {
    const recommendation = createStatisticRecommendation({
      article,
      markdown,
      statistics: unusedStatistics
    });
    recommendations.push({
      ...recommendation,
      priority: editorialStandards.has("cite_statistics") ? 86 : recommendation.priority,
      impact: editorialStandards.has("cite_statistics") ? recommendation.impact + 1 : recommendation.impact
    });
  }

  if (unusedFindings.length > 0) {
    recommendations.push(createFindingRecommendation({
      article,
      markdown,
      research,
      findings: unusedFindings
    }));
  }

  if (!hasPracticalExample(markdown)) {
    const recommendation = createExampleRecommendation({
      article,
      markdown,
      profile
    });
    recommendations.push({
      ...recommendation,
      priority: editorialStandards.has("practical_examples") ? 82 : recommendation.priority,
      impact: editorialStandards.has("practical_examples") ? recommendation.impact + 1 : recommendation.impact
    });
  }

  if (article.validation.seoScore < 75 && article.sources.length > 0 && hasOutboundCitation(markdown)) {
    const block = `## Evidence Check\n\nThe article uses ${article.sources.length} accepted sources. Before publishing, verify that each major claim is supported by the most relevant cited source and remove any claim that cannot be checked.`;
    recommendations.push(createAppendRecommendation({
      id: "strengthen-evidence",
      section: "improve",
      title: "Evidence coverage needs strengthening",
      reason: `The recorded SEO score is ${article.validation.seoScore}; the draft needs a clearer evidence check before publishing.`,
      actionLabel: "Insert Evidence Check",
      impact: 2,
      priority: 65,
      markdown,
      block
    }));
  }

  return recommendations.slice(0, 3);
}

function createExampleRecommendation({ article, markdown, profile }: { article: ArticleDocument; markdown: string; profile?: ProjectProfile | null }): SeoRecommendation {
  const insertion = planExampleInsertion(article, markdown, profile);
  return {
    id: "add-example",
    section: "improve",
    title: "No practical example detected",
    reason: "A concrete scenario helps readers translate the article's advice into a real decision.",
    actionLabel: "Insert Example",
    impact: 3,
    priority: 70,
    currentText: insertion.currentText,
    proposedText: insertion.proposedText,
    difference: createInlineDifference(insertion.currentText, insertion.proposedText),
    apply: (currentMarkdown) => planExampleInsertion(article, currentMarkdown, profile).markdown
  };
}

function createFindingRecommendation({ article, markdown, research, findings }: { article: ArticleDocument; markdown: string; research?: ResearchPack | null; findings: string[] }): SeoRecommendation {
  const insertion = planFindingInsertion(article, markdown, findings, research);
  return {
    id: "insert-findings",
    section: "improve",
    title: `${findings.length} research finding${findings.length === 1 ? " is" : "s are"} not referenced`,
    reason: "A useful existing finding can strengthen the section where it adds the most context.",
    actionLabel: "Insert Findings",
    impact: 3,
    priority: 75,
    currentText: insertion.currentText,
    proposedText: insertion.proposedText,
    difference: createInlineDifference(insertion.currentText, insertion.proposedText),
    apply: (currentMarkdown) => planFindingInsertion(article, currentMarkdown, findings, research).markdown
  };
}

function createStatisticRecommendation({ article, markdown, statistics }: { article: ArticleDocument; markdown: string; statistics: string[] }): SeoRecommendation {
  const insertion = planStatisticInsertion(article, markdown, statistics);
  return {
    id: "insert-statistics",
    section: "improve",
    title: `${statistics.length} research statistic${statistics.length === 1 ? " is" : "s are"} not used`,
    reason: "An existing quantified research finding can make the most relevant section more specific.",
    actionLabel: "Insert Statistics",
    impact: 3,
    priority: 80,
    currentText: insertion.currentText,
    proposedText: insertion.proposedText,
    difference: createInlineDifference(insertion.currentText, insertion.proposedText),
    apply: (currentMarkdown) => planStatisticInsertion(article, currentMarkdown, statistics).markdown
  };
}

function planSourceCitations(article: ArticleDocument, markdown: string, sources: ArticleDocument["sources"]) {
  const usableSources = sources
    .filter((source) => source.accepted !== false && source.url)
    .sort((left, right) => (right.authorityScore + right.relevanceScore) - (left.authorityScore + left.relevanceScore))
    .slice(0, 6);
  if (!usableSources.length) return { currentText: markdown, proposedText: markdown, markdown };

  const paragraphs = markdownBlockRanges(markdown)
    .filter((block) => isParagraphBlock(block.text) && !hasInlineCitation(block.text))
    .map((block) => {
      const source = bestSourceForText(block.text, usableSources, article.title);
      return {
        ...block,
        source,
        score: evidenceWeight(block.text, block.heading) + (source ? relevanceScore(`${source.title} ${source.domain} ${source.highlights.join(" ")}`, block.text) : 0)
      };
    })
    .filter((block) => block.source)
    .sort((left, right) => right.score - left.score);

  const selected: typeof paragraphs = [];
  const usedSourceIds = new Set<string>();
  for (const paragraph of paragraphs) {
    if (!paragraph.source || usedSourceIds.has(paragraph.source.id)) continue;
    selected.push(paragraph);
    usedSourceIds.add(paragraph.source.id);
    if (selected.length >= 3) break;
  }

  if (!selected.length) return { currentText: markdown, proposedText: markdown, markdown };

  const selectedByStart = [...selected].sort((left, right) => right.start - left.start);
  let nextMarkdown = markdown;
  const previews: string[] = [];
  for (const paragraph of selectedByStart) {
    const cited = addCitationToParagraph(paragraph.text, paragraph.source!);
    nextMarkdown = `${nextMarkdown.slice(0, paragraph.start)}${cited}${nextMarkdown.slice(paragraph.end)}`;
    previews.unshift(cited);
  }

  return {
    currentText: selected.map((item) => item.text).join("\n\n"),
    proposedText: previews.join("\n\n"),
    markdown: nextMarkdown
  };
}

function planCitationListInsertion(markdown: string, sources: ArticleDocument["sources"]) {
  const sourceItems = dedupeSourcesByUrl(sources);
  const block = sourceItems.length
    ? `## References\n\n${sourceItems.map((source) => `- ${referenceTitle(source)}\n  ${source.url}`).join("\n\n")}`
    : "## References";

  if (hasReferencesSection(markdown)) {
    return {
      block,
      sourceCount: sourceItems.length,
      markdown
    };
  }

  return {
    block,
    sourceCount: sourceItems.length,
    markdown: `${markdown.trimEnd()}\n\n${block}\n`
  };
}

function planExampleInsertion(article: ArticleDocument, markdown: string, profile?: ProjectProfile | null) {
  const target = chooseExampleTarget(markdown, article.title);
  const example = buildPracticalExample(article.title, target.heading, profile);
  const insertion = `${target.text.trimEnd()}\n\n${example}`;
  const suffix = markdown.slice(target.end);
  const nextMarkdown = `${markdown.slice(0, target.start)}${insertion}${suffix ? `\n\n${suffix.trimStart()}` : ""}`;
  return {
    currentText: target.text,
    proposedText: insertion,
    markdown: nextMarkdown
  };
}

function dedupeSourcesByUrl(sources: ArticleDocument["sources"]) {
  const seen = new Set<string>();
  const result: ArticleDocument["sources"] = [];
  for (const source of sources) {
    const url = source.url?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({ ...source, url });
  }
  return result;
}

function planFindingInsertion(article: ArticleDocument, markdown: string, findings: string[], research?: ResearchPack | null) {
  const sections = parseMarkdownSections(markdown);
  const ranked = findings
    .map((finding) => ({
      finding: cleanFact(finding),
      source: researchSourceForFact(research, finding),
      score: relevanceScore(`${article.title} ${sections.map((section) => section.heading).join(" ")}`, finding) + findingValue(finding, researchSourceForFact(research, finding))
    }))
    .sort((left, right) => right.score - left.score);
  const selected = ranked[0] ?? { finding: cleanFact(findings[0] ?? ""), source: null, score: 0 };
  const target = chooseInlineTarget(markdown, selected.finding, article.title);
  const findingSentence = findingToSentence(selected.finding, selected.source);
  const replacement = `${target.text.replace(/\s+$/g, "")} ${findingSentence}`.replace(/\s+/g, " ").trim();
  const nextMarkdown = `${markdown.slice(0, target.start)}${replacement}${markdown.slice(target.end)}`;
  return {
    currentText: target.text,
    proposedText: replacement,
    markdown: nextMarkdown
  };
}

function planStatisticInsertion(article: ArticleDocument, markdown: string, statistics: string[]) {
  const sections = parseMarkdownSections(markdown);
  const ranked = statistics
    .map((statistic) => ({
      statistic: cleanFact(statistic),
      score: relevanceScore(`${article.title} ${sections.map((section) => section.heading).join(" ")}`, statistic) + quantifiedStrength(statistic)
    }))
    .sort((left, right) => right.score - left.score);
  const statistic = ranked[0]?.statistic ?? cleanFact(statistics[0] ?? "");
  const target = chooseInlineTarget(markdown, statistic, article.title);
  const statisticSentence = statisticToSentence(statistic);
  const replacement = `${target.text.replace(/\s+$/g, "")} ${statisticSentence}`.replace(/\s+/g, " ").trim();
  const nextMarkdown = `${markdown.slice(0, target.start)}${replacement}${markdown.slice(target.end)}`;
  return {
    currentText: target.text,
    proposedText: replacement,
    markdown: nextMarkdown
  };
}

function chooseExampleTarget(markdown: string, title: string) {
  const sections = markdownSectionRanges(markdown)
    .filter((section) => section.level === 2 && section.body.trim())
    .map((section) => {
      const bodyWords = countWords(section.body);
      const hasPracticalLanguage = /\b(?:example|for instance|scenario|case|when a|where a|team|business|client|project|site)\b/i.test(section.body);
      const relevance = relevanceScore(`${title} ${section.heading}`, section.body);
      const weakness = Math.max(0, 90 - bodyWords) + (hasPracticalLanguage ? 0 : 25) - relevance;
      return { ...section, score: weakness };
    })
    .sort((left, right) => right.score - left.score);

  if (sections[0]) return sections[0];

  const fallback = markdown.trimEnd();
  return {
    heading: title,
    text: fallback,
    body: fallback,
    start: 0,
    end: fallback.length,
    level: 1,
    score: 0
  };
}

function markdownSectionRanges(markdown: string) {
  const headings = [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((match) => ({
    level: match[1]?.length ?? 1,
    heading: (match[2] ?? "").trim(),
    start: match.index ?? 0,
    bodyStart: (match.index ?? 0) + match[0].length
  }));

  return headings.map((heading, index) => {
    const next = headings.find((candidate, candidateIndex) => candidateIndex > index && candidate.level <= heading.level);
    const end = next?.start ?? markdown.trimEnd().length;
    const text = markdown.slice(heading.start, end).trimEnd();
    const body = markdown.slice(heading.bodyStart, end).trim();
    return { ...heading, end, text, body };
  });
}

function chooseInlineTarget(markdown: string, finding: string, title: string) {
  const paragraphs = markdownBlockRanges(markdown)
    .filter((block) => isParagraphBlock(block.text))
    .map((block) => ({
      ...block,
      score: relevanceScore(`${title} ${block.heading}`, finding) + relevanceScore(block.text, finding) + (block.heading ? 2 : 0)
    }))
    .sort((left, right) => right.score - left.score);

  if (paragraphs[0]) return paragraphs[0];

  const fallback = markdown.trimEnd();
  return {
    text: fallback,
    start: 0,
    end: fallback.length,
    heading: ""
  };
}

function markdownBlockRanges(markdown: string) {
  const blocks: Array<{ text: string; start: number; end: number; heading: string }> = [];
  let heading = "";
  const pattern = /(?:^|\n)([^\n](?:[\s\S]*?))(?=\n{2,}|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown))) {
    const raw = match[1] ?? "";
    const start = match.index + (markdown[match.index] === "\n" ? 1 : 0);
    const end = start + raw.length;
    const text = raw.trim();
    const headingMatch = text.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      heading = headingMatch[1] ?? "";
      continue;
    }
    blocks.push({ text, start, end, heading });
  }
  return blocks;
}

function parseMarkdownSections(markdown: string) {
  return [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => ({ heading: match[1] ?? "" }));
}

function isParagraphBlock(value: string) {
  return Boolean(value)
    && !/^#{1,6}\s+/m.test(value)
    && !/^\s*(?:[-*+]|\d+[.)])\s+/m.test(value)
    && !/^\s*>/m.test(value)
    && !/```/.test(value);
}

function isQuantifiedFinding(value: string) {
  return /(?:\d+(?:\.\d+)?\s?%|\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s?(?:percent|percentage points|million|billion|trillion|k|people|users|customers|respondents|companies|organisations|organizations|workers|adults|teams|projects|survey|market|revenue|cost|sales|growth|increase|decrease|reduction|reduced)\b)/i.test(value);
}

function quantifiedStrength(value: string) {
  if (/\d+(?:\.\d+)?\s?%/.test(value)) return 8;
  if (/\b(?:survey|respondents|market|revenue|growth|cost)\b/i.test(value)) return 5;
  if (/\b\d{1,3}(?:,\d{3})+\b/.test(value)) return 4;
  return 2;
}

function findingValue(value: string, source: ReturnType<typeof researchSourceForFact>) {
  const specificity = Math.min(5, keywordTerms(value).length);
  const sourceBoost = source ? 4 : 0;
  const cautionPenalty = /\b(?:may|might|could|possibly|unclear)\b/i.test(value) ? -2 : 0;
  return specificity + sourceBoost + cautionPenalty;
}

function bestSourceForText(text: string, sources: ArticleDocument["sources"], title: string) {
  return sources
    .map((source) => ({
      source,
      score: relevanceScore(`${source.title} ${source.domain} ${source.highlights.join(" ")}`, `${title} ${text}`) + source.relevanceScore / 20 + source.authorityScore / 25
    }))
    .sort((left, right) => right.score - left.score)[0]?.source ?? sources[0] ?? null;
}

function evidenceWeight(text: string, heading: string) {
  const claimSignals = countMatches(text, /\b(?:must|should|need|needs|requires|required|risk|evidence|data|research|survey|report|market|cost|growth|increase|reduce|improve|compare|verify|measure|compliance|regulation)\b/gi);
  const numericSignals = countMatches(text, /\d+(?:\.\d+)?\s?%|\b\d{1,3}(?:,\d{3})+\b/g);
  const headingBoost = /\b(?:risk|evidence|cost|market|research|requirements?|compliance|performance|results?|impact|benefits?)\b/i.test(heading) ? 5 : 0;
  return claimSignals * 3 + numericSignals * 5 + headingBoost + Math.min(8, countWords(text) / 18);
}

function addCitationToParagraph(text: string, source: ArticleDocument["sources"][number]) {
  const citation = `(Source: ${sourceCitationLabel(source)})`;
  const trimmed = text.trimEnd();
  if (trimmed.includes(citation)) return text;
  const footnoteIndex = trimmed.match(/\s+\[\d+\]$/);
  if (footnoteIndex) return trimmed;
  const terminal = trimmed.match(/([.!?])(["')\]]*)$/);
  if (!terminal || terminal.index === undefined) return `${trimmed} ${citation}`;
  const insertAt = terminal.index + terminal[1].length + (terminal[2]?.length ?? 0);
  return `${trimmed.slice(0, insertAt)} ${citation}${trimmed.slice(insertAt)}`;
}

function sourceCitationLabel(source: ArticleDocument["sources"][number]) {
  const raw = source.title || source.domain || domainFromUrl(source.url);
  const cleaned = cleanAttributionLabel(raw)
    .replace(/\b(?:Official|Guidance|Report|Study|Article|Homepage)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || source.domain || "Source";
}

function referenceTitle(source: ArticleDocument["sources"][number]) {
  return cleanLinkLabel(source.title || source.domain || domainFromUrl(source.url) || source.url);
}

function hasInlineCitation(text: string) {
  return /\(Source:\s*[^)]+\)|\[\d+\]|\[[^\]]+\]\(https?:\/\/[^)]+\)/i.test(text);
}

function researchSourceForFact(research: ResearchPack | null | undefined, fact: string) {
  const matched = research?.usefulFactSources?.find((item) => normalizeText(item.fact) === normalizeText(fact));
  if (!matched) return null;
  const source = research?.sources.find((item) => item.id === matched.sourceId || item.url === matched.sourceUrl);
  return {
    title: matched.sourceTitle || source?.title || source?.domain || "",
    domain: source?.domain || domainFromUrl(matched.sourceUrl),
    authorityScore: source?.authorityScore ?? 0
  };
}

function findingToSentence(value: string, source: ReturnType<typeof researchSourceForFact>) {
  const cleaned = cleanFact(value).replace(/[.;:,\s]+$/g, "");
  if (!cleaned) return "";
  const lowered = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  const label = source ? cleanAttributionLabel(source.title || source.domain) : "";
  if (label) return `${label} adds that ${lowered}.`;
  return `This also means ${lowered}.`;
}

function buildPracticalExample(title: string, heading: string, profile?: ProjectProfile | null) {
  const topic = title.replace(/[?.!]+$/g, "").trim();
  const context = exampleContext(topic, heading, profile);
  const sectionFocus = heading && !/^main issues$/i.test(heading) ? heading.toLowerCase() : "the decision";

  if (context.kind === "procurement") {
    return `Example: A water utility procuring a new maintenance contract might start with a broad requirement for faster response times. Once the team maps the risk properly, the useful question becomes more specific: which suppliers can prove they have enough local engineers, stock access, and escalation cover during severe weather? The draft specification then changes from a list of preferred features into a set of measurable service requirements. Procurement can score bidders on response evidence, mobilisation plans, and failure procedures, while operations checks whether the promised model would work on the ground. That practical link between ${sectionFocus} and day-to-day delivery helps the buyer avoid a cheap contract that looks compliant but fails when demand rises.`;
  }

  if (context.kind === "seo") {
    return `Example: A local business targeting ${context.market} searches might discover that its service page explains what it offers but never shows how a customer chooses between options. A stronger section would describe a real search journey: the customer compares nearby providers, checks whether the business handles their exact problem, looks for proof, then decides whether to call. The page can respond by adding local service details, a short proof point, and a clear next step near the relevant explanation. In practice, that makes ${sectionFocus} easier to understand because the advice is tied to the moment when a reader is deciding who to trust, not just to a generic ranking checklist.`;
  }

  if (context.kind === "construction") {
    return `Example: A developer seeking planning consent for a mixed-use site might have a technically sound proposal that still worries neighbours, highways officers, and future tenants for different reasons. The project team can use ${sectionFocus} to separate those concerns before the design is locked. Access issues go into the transport evidence, servicing questions become operating assumptions, and tenant requirements shape the ground-floor layout. That gives each decision a clear owner and a visible piece of evidence. The example matters because the risk is rarely one dramatic mistake; it is usually a series of small assumptions that become expensive once drawings, surveys, and consultant work have already moved on.`;
  }

  return `Example: A team working on ${topic.toLowerCase()} might begin with a sensible plan that still leaves one important question unresolved. The practical move is to take the weakest assumption in ${sectionFocus}, test it against the people who will use the outcome, and decide what evidence would change the next step. If the assumption holds, the team can move with more confidence. If it fails, they can adjust the scope before time and budget are committed. This kind of example improves the article because it turns the advice into a decision sequence: identify the risk, check the evidence, name the owner, and make the next action clear enough that someone can actually carry it out.`;
}

function exampleContext(title: string, heading: string, profile?: ProjectProfile | null) {
  const text = normalizeText(`${title} ${heading} ${profile?.industryKey ?? ""} ${profile?.industryLabel ?? ""}`);
  if (/\b(procurement|supplier|tender|contract|buyer|sourcing)\b/.test(text)) return { kind: "procurement" as const, market: "" };
  if (/\b(seo|search|ranking|rankings|keyword|local business|google|serp)\b/.test(text)) return { kind: "seo" as const, market: profile?.regionLabel ?? "local" };
  if (/\b(construction|developer|planning|contractor|site|building|property)\b/.test(text)) return { kind: "construction" as const, market: "" };
  return { kind: "general" as const, market: "" };
}

function relevanceScore(left: string, right: string) {
  const leftTerms = new Set(keywordTerms(left));
  return keywordTerms(right).reduce((score, term) => score + (leftTerms.has(term) ? 1 : 0), 0);
}

function keywordTerms(value: string) {
  const stop = new Set(["about", "after", "also", "and", "are", "but", "can", "for", "from", "has", "have", "into", "that", "the", "their", "this", "with", "using", "will", "when"]);
  return normalizeText(value).split(" ").filter((term) => term.length > 3 && !stop.has(term));
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function countMatches(value: string, pattern: RegExp) {
  return (value.match(pattern) ?? []).length;
}

function statisticToSentence(value: string) {
  const cleaned = cleanFact(value).replace(/[.;:,\s]+$/g, "");
  if (!cleaned) return "";
  const lowered = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  return `For context, ${lowered}.`;
}

function cleanAttributionLabel(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.:\s]+$/g, "").trim().slice(0, 90);
}

function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function createInlineDifference(currentText: string, proposedText: string) {
  return `- ${currentText}\n+ ${proposedText}`;
}

function buildProjectRecommendations(markdown: string, profile?: ProjectProfile | null) {
  if (!profile) return [];
  const recommendations: SeoRecommendation[] = [];
  const editorialStandards = new Set(profile.editorialStandards ?? []);

  if (profile.regionKey !== "global" && !containsProfileTerm(markdown, profile.regionKey, profile.regionLabel)) {
    const block = `## ${profile.regionLabel} Context\n\nFor readers in ${profile.regionLabel}, the practical position depends on current local requirements, market conditions, and guidance. Confirm the latest regional rules before acting on this article.`;
    recommendations.push(createAppendRecommendation({
      id: "add-region-context",
      section: "project",
      title: `${profile.regionLabel} context is missing`,
      reason: `The project targets ${profile.regionLabel}, but the draft does not make that regional relevance explicit.`,
      actionLabel: "Add Region Context",
      impact: 2,
      priority: 60,
      markdown,
      block
    }));
  }

  if (profile.industryKey !== "general" && !containsProfileTerm(markdown, profile.industryKey, profile.industryLabel)) {
    const block = `## Relevance To ${profile.industryLabel}\n\nIn ${profile.industryLabel}, this issue affects planning, delivery, risk, and the quality of operational decisions. Readers should assess the guidance against their organisation's current constraints.`;
    recommendations.push(createAppendRecommendation({
      id: "add-industry-context",
      section: "project",
      title: `${profile.industryLabel} relevance is unclear`,
      reason: `The active project industry is ${profile.industryLabel}, but the draft does not connect the topic to it directly.`,
      actionLabel: "Add Industry Context",
      impact: 2,
      priority: 55,
      markdown,
      block
    }));
  }

  if (profile.audienceKey !== "general_audience" && !containsProfileTerm(markdown, profile.audienceKey, profile.audienceLabel)) {
    const block = `## What This Means For ${profile.audienceLabel}\n\n${profile.audienceLabel} should focus on the evidence that changes priorities, the constraints that affect delivery, and the next decision that needs a clear owner.`;
    recommendations.push(createAppendRecommendation({
      id: "align-audience",
      section: "project",
      title: `${profile.audienceLabel} are not addressed directly`,
      reason: `The active audience is ${profile.audienceLabel}, but the draft does not explicitly translate the topic for them.`,
      actionLabel: "Align Audience",
      impact: 2,
      priority: 50,
      markdown,
      block
    }));
  }

  if ((editorialStandards.has("avoid_marketing_cliches") || editorialStandards.has("balanced_neutral_tone")) && containsMarketingCliches(markdown)) {
    const block = `## Editorial Tone Check\n\nRemove generic promotional phrases, keep claims specific, and present the guidance in a balanced, neutral voice grounded in evidence and practical trade-offs.`;
    recommendations.push(createAppendRecommendation({
      id: "tone-down-cliches",
      section: "project",
      title: "Editorial tone needs tightening",
      reason: "The draft uses generic marketing phrasing that conflicts with the project's editorial standards.",
      actionLabel: "Add Tone Check",
      impact: 2,
      priority: 68,
      markdown,
      block
    }));
  }

  return recommendations.slice(0, 3);
}

function buildInternalLinkRecommendations(markdown: string, sitePages: SiteKnowledgePageDocument[], siteProfile?: ProjectSiteProfileDocument | null, profile?: ProjectProfile | null) {
  const opportunities = findInternalLinkOpportunities(markdown, sitePages, siteProfile);
  if (!opportunities.length) return [];
  const editorialStandards = new Set(profile?.editorialStandards ?? []);

  const selected = opportunities.slice(0, 5);
  const preview = selected.map((item) => `${item.anchorText} -> ${displayInternalUrl(item.url)}`).join("\n");
  const top = selected[0];

  return [{
    id: "suggest-internal-links",
    section: "project" as const,
    title: `${selected.length} internal linking ${selected.length === 1 ? "opportunity" : "opportunities"} detected`,
    reason: top ? `${top.title}: ${top.reason}` : "Imported Website Intelligence pages match topics in this article.",
    actionLabel: "Generate Suggestions",
    impact: Math.min(5, Math.max(2, selected.length)),
    priority: editorialStandards.has("include_internal_links") ? 90 : 84,
    currentText: "No suggested internal links have been inserted for these opportunities.",
    proposedText: preview,
    difference: preview.split("\n").map((line) => `+ ${line}`).join("\n"),
    metadata: { internalLinkOpportunities: selected },
    apply: (currentMarkdown: string) => insertInternalLinks(currentMarkdown, selected).markdown
  }];
}

function findInternalLinkOpportunities(markdown: string, sitePages: SiteKnowledgePageDocument[], siteProfile?: ProjectSiteProfileDocument | null): InternalLinkOpportunity[] {
  const articleText = normalizeText(markdownWithoutLinks(markdown));
  const profileServices = normalizedSet(siteProfile?.services ?? []);
  const profileLocations = normalizedSet(siteProfile?.locations ?? []);
  const profileProducts = normalizedSet(siteProfile?.products ?? []);
  const seenUrls = new Set<string>();

  return sitePages
    .filter((page) => !isUnsafeInternalLinkPage(page))
    .map((page) => scoreInternalLinkPage(page, markdown, articleText, profileServices, profileLocations, profileProducts))
    .filter((item): item is InternalLinkOpportunity & { score: number } => Boolean(item))
    .filter((item) => {
      const key = normalizeDestination(item.url);
      if (seenUrls.has(key) || hasExistingDestinationLink(markdown, item.url)) return false;
      seenUrls.add(key);
      return true;
    })
    .sort((left, right) => matchTypePriority(right.matchType) - matchTypePriority(left.matchType) || right.confidence - left.confidence || right.score - left.score)
    .map(({ score: _score, ...item }) => item);
}

function scoreInternalLinkPage(
  page: SiteKnowledgePageDocument,
  markdown: string,
  articleText: string,
  profileServices: Set<string>,
  profileLocations: Set<string>,
  profileProducts: Set<string>
): (InternalLinkOpportunity & { score: number }) | null {
  const terms = internalLinkTerms(page);
  const candidates = terms
    .map((term) => {
      const normalized = normalizeText(term);
      const occurrence = findUnlinkedOccurrence(markdown, term);
      const exact = normalized.length >= 3 && articleText.includes(normalized) && occurrence;
      const service = profileServices.has(normalized) || profileProducts.has(normalized) || looksLikeServicePage(page.url);
      const location = profileLocations.has(normalized) || looksLikeLocationPage(page.url, term);
      const overlap = relevanceScore(`${page.title} ${page.h1} ${page.shortSummary} ${page.metaDescription} ${urlKeywords(page.url)}`, markdown);
      const matchType: LinkOpportunityMatchType = exact
        ? service ? "service" : location ? "location" : "topic"
        : overlap >= 2 ? "partial" : "topic";
      const usable = exact || (overlap >= 2 && occurrence);
      return usable ? { term, occurrence, matchType, overlap, service, location } : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => matchTypePriority(right.matchType) - matchTypePriority(left.matchType) || right.overlap - left.overlap || right.term.length - left.term.length);

  const best = candidates[0];
  if (!best) return null;

  const confidence = confidenceForInternalLink(best.matchType, best.overlap, best.term, page);
  return {
    url: displayInternalUrl(page.url),
    title: cleanLinkLabel(page.title || page.h1 || best.term),
    anchorText: best.occurrence.text,
    reason: reasonForInternalLink(best.matchType),
    confidence,
    matchType: best.matchType,
    score: confidence + best.overlap
  };
}

function insertInternalLinks(markdown: string, opportunities: InternalLinkOpportunity[]) {
  let nextMarkdown = markdown;
  const inserted: InternalLinkOpportunity[] = [];

  for (const opportunity of opportunities) {
    if (inserted.length >= 5) break;
    const occurrence = findUnlinkedOccurrence(nextMarkdown, opportunity.anchorText);
    if (!occurrence || hasExistingDestinationLink(nextMarkdown, opportunity.url)) continue;
    const linked = `[${occurrence.text}](${opportunity.url})`;
    nextMarkdown = `${nextMarkdown.slice(0, occurrence.start)}${linked}${nextMarkdown.slice(occurrence.end)}`;
    inserted.push(opportunity);
  }

  return { markdown: nextMarkdown, inserted };
}

function findUnlinkedOccurrence(markdown: string, anchorText: string) {
  const cleanAnchor = cleanLinkLabel(anchorText);
  if (cleanAnchor.length < 3) return null;
  const blocks = markdownBlockRanges(markdown).filter((block) => isParagraphBlock(block.text));

  for (const block of blocks) {
    const pattern = phrasePattern(cleanAnchor);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(block.text))) {
      const text = match[0];
      const start = block.start + (match.index ?? 0);
      const end = start + text.length;
      if (!isInsideMarkdownLink(markdown, start, end)) return { text, start, end };
    }
  }

  return null;
}

function internalLinkTerms(page: SiteKnowledgePageDocument) {
  const terms = [
    page.title,
    page.h1,
    ...urlTermCandidates(page.url),
    ...String(page.metadata?.keywords ?? "").split(",")
  ];
  return uniqueCleanTerms(terms)
    .filter((term) => term.length >= 3 && term.length <= 80)
    .filter((term) => !/^(?:home|homepage|contact|privacy|terms|blog|news|services|products|about)$/i.test(term));
}

function uniqueCleanTerms(terms: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const term of terms) {
    const cleaned = cleanPageTerm(term);
    const key = normalizeText(cleaned);
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result.sort((left, right) => right.length - left.length);
}

function cleanPageTerm(value: string) {
  return value
    .replace(/\s+(?:\||\u2013|-)\s+.*$/g, "")
    .replace(/\b(?:services?|contractors?|company|near me)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function urlTermCandidates(value: string) {
  const path = pathnameFromUrl(value);
  const segments = path.split("/").filter(Boolean);
  const last = segments.at(-1) ?? "";
  const terms = [slugToWords(last)];
  if (segments.length >= 2) terms.push(slugToWords(segments.slice(-2).join(" ")));
  return terms.filter(Boolean);
}

function isUnsafeInternalLinkPage(page: SiteKnowledgePageDocument) {
  const path = pathnameFromUrl(page.url).replace(/\/+$/g, "") || "/";
  const text = normalizeText(`${path} ${page.title} ${page.h1}`);
  if (path === "/") return true;
  if (/(^|\/)(?:contact|contact-us|privacy|privacy-policy|terms|terms-and-conditions|cookie-policy|cookies)(?:\/|$)/i.test(path)) return true;
  if (/^(?:contact|privacy policy|terms|terms and conditions|cookie policy|home|homepage)$/i.test(cleanLinkLabel(page.title || page.h1))) return true;
  if (/^\/(?:blog|news|articles|posts)$/i.test(path)) return true;
  return /\b(?:privacy policy|terms and conditions|cookie policy)\b/.test(text);
}

function displayInternalUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return value.startsWith("/") ? value : `/${value.replace(/^\/+/, "")}`;
  }
}

function normalizeDestination(value: string) {
  return displayInternalUrl(value).replace(/\/+$/g, "").toLowerCase() || "/";
}

function hasExistingDestinationLink(markdown: string, url: string) {
  const destination = normalizeDestination(url);
  return markdownLinkRanges(markdown).some((range) => normalizeDestination(range.url) === destination);
}

function markdownWithoutLinks(markdown: string) {
  return markdown.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
}

function markdownLinkRanges(markdown: string) {
  return [...markdown.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    url: match[2] ?? ""
  }));
}

function isInsideMarkdownLink(markdown: string, start: number, end: number) {
  return markdownLinkRanges(markdown).some((range) => start >= range.start && end <= range.end);
}

function phrasePattern(value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
}

function normalizedSet(values: string[]) {
  return new Set(values.map(normalizeText).filter((value) => value.length >= 3));
}

function matchTypePriority(type: LinkOpportunityMatchType) {
  if (type === "topic") return 4;
  if (type === "service") return 3;
  if (type === "location") return 2;
  return 1;
}

function confidenceForInternalLink(type: LinkOpportunityMatchType, overlap: number, term: string, page: SiteKnowledgePageDocument) {
  const base = type === "topic" ? 96 : type === "service" ? 94 : type === "location" ? 90 : 74;
  const summaryBoost = page.shortSummary ? 1 : 0;
  const lengthBoost = term.split(/\s+/).length > 1 ? 1 : 0;
  return Math.min(99, base + Math.min(3, overlap) + summaryBoost + lengthBoost);
}

function reasonForInternalLink(type: LinkOpportunityMatchType) {
  if (type === "topic") return "Exact topic discussed in the article.";
  if (type === "service") return "Primary service discussed extensively in the article.";
  if (type === "location") return "Location mentioned in the article and matched to an imported local page.";
  return "Related imported page shares strong topic signals with the article.";
}

function looksLikeServicePage(url: string) {
  return /\/(?:services?|solutions?|products?)\//i.test(pathnameFromUrl(url));
}

function looksLikeLocationPage(url: string, term: string) {
  const path = pathnameFromUrl(url);
  return /\/(?:locations?|areas?|service-areas?)\//i.test(path) || /\bin\b/i.test(term);
}

function urlKeywords(value: string) {
  return urlTermCandidates(value).join(" ");
}

function pathnameFromUrl(value: string) {
  try {
    return new URL(value).pathname || "/";
  } catch {
    const clean = value.split(/[?#]/)[0] ?? "/";
    return clean.startsWith("/") ? clean : `/${clean}`;
  }
}

function slugToWords(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function createAppendRecommendation(input: Omit<SeoRecommendation, "currentText" | "proposedText" | "difference" | "apply"> & { markdown: string; block: string }): SeoRecommendation {
  const proposedText = input.block.trim();
  return {
    id: input.id,
    section: input.section,
    title: input.title,
    reason: input.reason,
    actionLabel: input.actionLabel,
    impact: input.impact,
    priority: input.priority,
    currentText: "No matching section is present in the current draft.",
    proposedText,
    difference: proposedText.split("\n").map((line) => `+ ${line}`).join("\n"),
    apply: (markdown) => `${markdown.trim()}\n\n${proposedText}\n`
  };
}

function hasCallToAction(markdown: string) {
  return /^##\s+.*(?:Next Steps?|Get Started|How We Can Help|Contact|Book|Request)\b/im.test(markdown);
}

function hasOutboundCitation(markdown: string) {
  return /\[[^\]]+\]\(https?:\/\/[^)]+\)|\(Source:\s*[^)]+\)|\[\d+\]/i.test(markdown);
}

function hasPracticalExample(markdown: string) {
  return /^##\s+.*(?:Example|Case Study)\b/im.test(markdown) || /^Example:\s+/im.test(markdown);
}

function hasReferencesSection(markdown: string) {
  return /^##\s+(?:References|Sources|Bibliography)\b/im.test(markdown);
}

function classifyFaqCoverage(markdown: string): { status: FaqCoverageStatus; confidence: number; questionHeadingCount: number; hasExplicitFaqHeading: boolean } {
  const headings = markdownHeadings(markdown).filter((heading) => heading.level === 2 || heading.level === 3);
  const hasExplicitFaqHeading = headings.some((heading) => isFaqHeading(heading.text));
  const questionHeadingCount = headings.filter((heading) => isQuestionStyleHeading(heading.text)).length;

  if (hasExplicitFaqHeading || questionHeadingCount >= 3) {
    return {
      status: "complete",
      confidence: hasExplicitFaqHeading ? 0.98 : 0.9,
      questionHeadingCount,
      hasExplicitFaqHeading
    };
  }

  if (questionHeadingCount > 0) {
    return {
      status: "partial",
      confidence: questionHeadingCount === 2 ? 0.86 : 0.78,
      questionHeadingCount,
      hasExplicitFaqHeading
    };
  }

  return {
    status: "missing",
    confidence: headings.length ? 0.94 : 0.88,
    questionHeadingCount,
    hasExplicitFaqHeading
  };
}

function markdownHeadings(markdown: string) {
  return [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((match) => ({
    level: match[1]?.length ?? 1,
    text: (match[2] ?? "").trim()
  }));
}

function isFaqHeading(value: string) {
  return /\b(?:FAQs?|Frequently Asked Questions|Common Questions)\b/i.test(value);
}

function isQuestionStyleHeading(value: string) {
  return /\?\s*$/.test(value) || /^(?:What|How|Why|When|Where|Who|Which|Can|Should|Does|Is|Are)\b/i.test(value.trim());
}

function containsFact(markdown: string, fact: string) {
  const needle = normalizeText(fact).slice(0, 60);
  return needle.length >= 20 && normalizeText(markdown).includes(needle);
}

function containsProfileTerm(markdown: string, key: string, label: string) {
  const text = normalizeText(markdown);
  const aliases = [label, key.replace(/_/g, " ")];
  if (key === "united_kingdom") aliases.push("UK", "British");
  if (key === "united_states") aliases.push("US", "USA", "American");
  return aliases.some((term) => text.includes(normalizeText(term)));
}

function cleanLinkLabel(value: string) {
  return value.replace(/[\[\]]/g, "").replace(/\s+/g, " ").trim();
}

function cleanFact(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 320);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function containsMarketingCliches(markdown: string) {
  return /\b(?:cutting edge|game changer|world class|best in class|industry leading|revolutionary|unlock your potential|next level|seamless solution)\b/i.test(markdown);
}
