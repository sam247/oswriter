import type { ArticleDocument, ProjectProfile, ResearchPack } from "@/lib/types";

export type SeoRecommendationSection = "fix" | "improve" | "project";

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
}

export function buildSeoDecisionEngine({ article, markdown, research, profile }: SeoDecisionInput): SeoDecisionResult {
  const recommendations = [
    ...buildFixRecommendations(article, markdown, profile),
    ...buildImproveRecommendations(article, markdown, research, profile),
    ...buildProjectRecommendations(markdown, profile)
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

export function applySeoRecommendations(markdown: string, recommendations: SeoRecommendation[]) {
  return recommendations.reduce((next, recommendation) => recommendation.apply(next), markdown);
}

function buildFixRecommendations(article: ArticleDocument, markdown: string, profile?: ProjectProfile | null) {
  const recommendations: SeoRecommendation[] = [];
  const topic = article.title.replace(/[?.!]+$/, "");

  if (!/^##\s+FAQ\b/im.test(markdown)) {
    const block = `## FAQ\n\n### What should readers know first about ${topic}?\nThe most important starting point is to understand the practical constraints, evidence, and decisions that shape the outcome.\n\n### What commonly causes problems with ${topic}?\nProblems usually arise when assumptions are not checked early, responsibilities are unclear, or evidence is considered too late.\n\n### What should readers do next?\nReview the current requirements, verify the supporting evidence, and turn the findings into a clear next action.`;
    recommendations.push(createAppendRecommendation({
      id: "add-faq",
      section: "fix",
      title: "No FAQ section detected",
      reason: "A focused FAQ adds answer-ready coverage for long-tail searches and featured snippets.",
      actionLabel: "Apply FAQ",
      impact: 4,
      priority: 100,
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
      reason: "The article explains the topic but does not tell the reader what to do after reading it.",
      actionLabel: "Apply CTA",
      impact: 3,
      priority: 95,
      markdown,
      block
    }));
  }

  if (article.sources.length > 0 && !hasOutboundCitation(markdown)) {
    const block = `## Sources\n\n${article.sources.slice(0, 4).map((source) => `- [${cleanLinkLabel(source.title || source.domain)}](${source.url})`).join("\n")}`;
    recommendations.push(createAppendRecommendation({
      id: "cite-sources",
      section: "fix",
      title: "No sources cited in the article",
      reason: `${article.sources.length} accepted sources are available, but readers cannot verify claims from the draft.`,
      actionLabel: "Insert Sources",
      impact: 4,
      priority: 98,
      markdown,
      block
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

  return recommendations.slice(0, 4);
}

function buildImproveRecommendations(article: ArticleDocument, markdown: string, research?: ResearchPack | null, profile?: ProjectProfile | null) {
  const recommendations: SeoRecommendation[] = [];
  const unusedFacts = (research?.usefulFacts ?? []).filter((fact) => !containsFact(markdown, fact));
  const unusedStatistics = unusedFacts.filter((fact) => /\d/.test(fact)).slice(0, 3);
  const unusedFindings = unusedFacts.filter((fact) => !/\d/.test(fact)).slice(0, 3);

  if (unusedStatistics.length > 0 && !/^##\s+Key Statistics\b/im.test(markdown)) {
    const block = `## Key Statistics\n\n${unusedStatistics.map((fact) => `- ${cleanFact(fact)}`).join("\n")}`;
    recommendations.push(createAppendRecommendation({
      id: "insert-statistics",
      section: "improve",
      title: `${unusedStatistics.length} research statistic${unusedStatistics.length === 1 ? " is" : "s are"} not used`,
      reason: "These existing research findings can make the article more specific and evidence-led.",
      actionLabel: "Insert Statistics",
      impact: 3,
      priority: 80,
      markdown,
      block
    }));
  }

  if (unusedFindings.length > 0 && !/^##\s+Research Findings\b/im.test(markdown)) {
    const block = `## Research Findings\n\n${unusedFindings.map((fact) => `- ${cleanFact(fact)}`).join("\n")}`;
    recommendations.push(createAppendRecommendation({
      id: "insert-findings",
      section: "improve",
      title: `${unusedFindings.length} research finding${unusedFindings.length === 1 ? " is" : "s are"} not referenced`,
      reason: "Useful findings gathered for this article are absent from the current draft.",
      actionLabel: "Insert Findings",
      impact: 3,
      priority: 75,
      markdown,
      block
    }));
  }

  if (!/^##\s+.*(?:Example|Case Study)\b/im.test(markdown)) {
    const industry = profile?.industryLabel && profile.industryKey !== "general" ? profile.industryLabel.toLowerCase() : "the relevant industry";
    const block = `## Practical Example\n\nConsider a typical ${industry} project where the initial assumptions appear sound but one constraint changes. The strongest response is to verify the evidence, identify who owns the decision, and compare the cost of acting now with the risk of waiting.`;
    recommendations.push(createAppendRecommendation({
      id: "add-example",
      section: "improve",
      title: "No practical example detected",
      reason: "A concrete scenario helps readers translate the article's advice into a real decision.",
      actionLabel: "Insert Example",
      impact: 2,
      priority: 70,
      markdown,
      block
    }));
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

function buildProjectRecommendations(markdown: string, profile?: ProjectProfile | null) {
  if (!profile) return [];
  const recommendations: SeoRecommendation[] = [];

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

  return recommendations.slice(0, 3);
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
  return /\[[^\]]+\]\(https?:\/\/[^)]+\)/i.test(markdown);
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
