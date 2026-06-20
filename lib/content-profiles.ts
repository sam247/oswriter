export const CONTENT_PROFILE_KEYS = [
  "best_of",
  "comparison",
  "buying_guide",
  "how_to",
  "industry_explainer",
  "thought_leadership",
  "editorial_opinion",
  "case_study",
  "trend_analysis",
  "executive_brief",
  "white_paper",
  "industry_report",
  "market_analysis",
  "research_report"
] as const;

export type ContentProfile = (typeof CONTENT_PROFILE_KEYS)[number];
export type ResearchDepth = "medium" | "high" | "very_high";

export interface ContentProfileDefinition {
  key: ContentProfile;
  label: string;
  phase: 1 | 2 | 3;
  optimized: boolean;
  purpose: string;
  research: {
    depth: ResearchDepth;
    minimumSources: number;
    minimumEvidenceItems: number;
    targetSources: string[];
    citationExpectations: string;
    comparisonRequired?: boolean;
  };
  outline: string[];
  writingInstructions: string[];
  validation: string[];
}

const profile = (
  definition: Omit<ContentProfileDefinition, "optimized"> & { optimized?: boolean }
): ContentProfileDefinition => ({ ...definition, optimized: definition.optimized ?? definition.phase === 1 });

export const CONTENT_PROFILES: Record<ContentProfile, ContentProfileDefinition> = {
  industry_explainer: profile({
    key: "industry_explainer", label: "Industry Explainer", phase: 1,
    purpose: "Explain a concept clearly and authoritatively.",
    research: { depth: "high", minimumSources: 10, minimumEvidenceItems: 8, targetSources: ["primary sources", "standards bodies", "trusted industry publications"], citationExpectations: "Support definitions, technical claims, and industry examples with evidence." },
    outline: ["Introduction", "Definition", "Why It Matters", "Key Components", "Benefits", "Challenges", "Examples", "Conclusion"],
    writingInstructions: ["Lead with a precise definition.", "Build understanding from fundamentals to practical implications.", "Use concrete industry examples."],
    validation: ["clear definition", "why-it-matters section", "key components", "benefits and challenges", "examples"]
  }),
  best_of: profile({
    key: "best_of", label: "Best Of", phase: 1,
    purpose: "Help commercially minded readers choose between multiple products or services.",
    research: { depth: "high", minimumSources: 8, minimumEvidenceItems: 8, targetSources: ["official product pages", "pricing pages", "product documentation", "credible independent reviews"], citationExpectations: "Ground product features, pricing, strengths, and limitations in current evidence.", comparisonRequired: true },
    outline: ["Quick Recommendations", "Evaluation Criteria", "Product Reviews", "Comparison Table", "Final Recommendation"],
    writingInstructions: ["Evaluate multiple named options using consistent criteria.", "State strengths, weaknesses, and best-fit users for each option.", "Make a qualified final recommendation rather than declaring one universal winner."],
    validation: ["multiple products", "evaluation criteria", "strengths and weaknesses", "comparison table", "final recommendation"]
  }),
  comparison: profile({
    key: "comparison", label: "Comparison", phase: 1,
    purpose: "Provide a balanced head-to-head evaluation.",
    research: { depth: "high", minimumSources: 8, minimumEvidenceItems: 8, targetSources: ["official product pages", "pricing pages", "product documentation", "credible independent analysis"], citationExpectations: "Use comparable evidence for every entity and distinguish facts from judgment.", comparisonRequired: true },
    outline: ["Overview", "Feature Comparison", "Pricing", "Strengths", "Weaknesses", "Who Should Choose Which"],
    writingInstructions: ["Apply the same criteria to each entity.", "Keep the analysis balanced and explicit about trade-offs.", "End with use-case-specific recommendations."],
    validation: ["multiple entities", "side-by-side analysis", "pricing", "balanced strengths and weaknesses", "who-should-choose-which recommendation"]
  }),
  buying_guide: profile({
    key: "buying_guide", label: "Buying Guide", phase: 1,
    purpose: "Give readers a reliable framework for making a purchase decision.",
    research: { depth: "high", minimumSources: 8, minimumEvidenceItems: 7, targetSources: ["standards and guidance", "official vendor documentation", "credible expert publications"], citationExpectations: "Support decision criteria, risks, costs, and essential capabilities with evidence." },
    outline: ["Buying Considerations", "Essential Features", "Budget Factors", "Common Mistakes", "Recommendations"],
    writingInstructions: ["Organize advice around a reusable decision framework.", "Explain trade-offs, risks, and total cost considerations.", "Give concrete questions readers can ask vendors."],
    validation: ["buying considerations", "essential features", "budget factors", "common mistakes", "recommendations"]
  }),
  how_to: profile({
    key: "how_to", label: "How-To Guide", phase: 1,
    purpose: "Help a reader complete a task successfully.",
    research: { depth: "medium", minimumSources: 6, minimumEvidenceItems: 6, targetSources: ["official documentation", "standards and guidance", "credible practitioner sources"], citationExpectations: "Support prerequisites, safety or risk claims, and non-obvious procedural advice." },
    outline: ["Introduction", "Prerequisites", "Step 1", "Step 2", "Step 3", "Common Mistakes", "Conclusion"],
    writingInstructions: ["Use ordered, action-led steps.", "State prerequisites and expected outcomes.", "Include checkpoints, common mistakes, and recovery advice."],
    validation: ["prerequisites", "clear ordered steps", "actionable advice", "common mistakes", "procedural completeness"]
  }),
  thought_leadership: profile({ key: "thought_leadership", label: "Thought Leadership", phase: 2, purpose: "Present an informed, distinctive perspective.", research: { depth: "high", minimumSources: 8, minimumEvidenceItems: 7, targetSources: ["primary research", "industry data", "expert analysis"], citationExpectations: "Use evidence to support the thesis while clearly separating interpretation." }, outline: ["Executive Premise", "Current Context", "Core Argument", "Implications", "Recommendations", "Conclusion"], writingInstructions: ["Advance a clear thesis.", "Acknowledge counterarguments and uncertainty."], validation: ["clear thesis", "evidence-backed argument", "counterargument", "implications"] }),
  editorial_opinion: profile({ key: "editorial_opinion", label: "Editorial Opinion", phase: 2, purpose: "Make a persuasive, transparent editorial case.", research: { depth: "medium", minimumSources: 6, minimumEvidenceItems: 5, targetSources: ["primary sources", "reputable reporting"], citationExpectations: "Verify factual premises and label opinion as opinion." }, outline: ["Position", "Context", "Argument", "Counterpoint", "Conclusion"], writingInstructions: ["State the position early.", "Distinguish facts, inference, and opinion."], validation: ["clear position", "supporting evidence", "counterpoint"] }),
  case_study: profile({ key: "case_study", label: "Case Study", phase: 2, purpose: "Explain a real situation, intervention, and result.", research: { depth: "high", minimumSources: 6, minimumEvidenceItems: 8, targetSources: ["first-party records", "interviews", "verified metrics"], citationExpectations: "Attribute outcomes and avoid unsupported causation." }, outline: ["Executive Summary", "Background", "Challenge", "Approach", "Results", "Lessons"], writingInstructions: ["Use a chronological narrative.", "Quantify results only when supported."], validation: ["background", "challenge", "approach", "results", "lessons"] }),
  trend_analysis: profile({ key: "trend_analysis", label: "Trend Analysis", phase: 2, purpose: "Analyze an emerging pattern and its implications.", research: { depth: "high", minimumSources: 10, minimumEvidenceItems: 10, targetSources: ["recent primary data", "industry reports", "expert analysis"], citationExpectations: "Date evidence and distinguish durable trends from short-term signals." }, outline: ["Executive Summary", "Trend Definition", "Evidence", "Drivers", "Scenarios", "Implications"], writingInstructions: ["Anchor claims in dated evidence.", "Discuss uncertainty and alternative scenarios."], validation: ["dated evidence", "trend drivers", "uncertainty", "implications"] }),
  executive_brief: profile({ key: "executive_brief", label: "Executive Brief", phase: 2, purpose: "Give decision-makers a concise, actionable overview.", research: { depth: "high", minimumSources: 8, minimumEvidenceItems: 7, targetSources: ["primary sources", "credible industry analysis"], citationExpectations: "Support material risks, opportunities, and recommendations." }, outline: ["Executive Summary", "Situation", "Key Findings", "Risks and Opportunities", "Recommendations", "Next Steps"], writingInstructions: ["Prioritize decisions and implications.", "Keep background concise."], validation: ["executive summary", "key findings", "risks", "recommendations", "next steps"] }),
  white_paper: profile({ key: "white_paper", label: "White Paper", phase: 3, purpose: "Provide a deeply researched treatment of a complex issue.", research: { depth: "very_high", minimumSources: 20, minimumEvidenceItems: 16, targetSources: ["primary research", "standards", "peer-reviewed or institutional sources"], citationExpectations: "Maintain high evidence density and trace important claims to authoritative sources." }, outline: ["Executive Summary", "Problem Definition", "Method or Framework", "Evidence", "Analysis", "Recommendations", "Conclusion"], writingInstructions: ["Use formal, precise language.", "Explain methodology and limitations."], validation: ["executive summary", "methodology", "evidence density", "limitations", "recommendations"] }),
  industry_report: profile({ key: "industry_report", label: "Industry Report", phase: 3, purpose: "Assess the state and direction of an industry.", research: { depth: "very_high", minimumSources: 20, minimumEvidenceItems: 16, targetSources: ["official statistics", "market data", "institutional reports"], citationExpectations: "Date and source all material market claims." }, outline: ["Executive Summary", "Market Context", "Key Data", "Segments", "Drivers and Risks", "Outlook"], writingInstructions: ["Separate observed data from forecasts."], validation: ["executive summary", "market data", "segments", "risks", "outlook"] }),
  market_analysis: profile({ key: "market_analysis", label: "Market Analysis", phase: 3, purpose: "Analyze market size, structure, competition, and opportunity.", research: { depth: "very_high", minimumSources: 20, minimumEvidenceItems: 16, targetSources: ["official statistics", "financial filings", "market datasets"], citationExpectations: "Source quantitative claims and explain estimation limits." }, outline: ["Executive Summary", "Market Definition", "Size and Growth", "Segments", "Competitive Landscape", "Opportunities and Risks"], writingInstructions: ["Define the market boundary and assumptions."], validation: ["market definition", "size and growth", "competitive landscape", "assumptions", "risks"] }),
  research_report: profile({ key: "research_report", label: "Research Report", phase: 3, purpose: "Present a research question, method, evidence, and findings.", research: { depth: "very_high", minimumSources: 20, minimumEvidenceItems: 16, targetSources: ["primary research", "peer-reviewed sources", "institutional datasets"], citationExpectations: "Provide traceable evidence and disclose limitations." }, outline: ["Abstract", "Research Question", "Methodology", "Findings", "Discussion", "Limitations", "Conclusion"], writingInstructions: ["Do not overstate causation or generalizability."], validation: ["research question", "methodology", "findings", "limitations", "conclusion"] })
};

export const CONTENT_PROFILE_OPTIONS = CONTENT_PROFILE_KEYS.map((key) => ({ value: key, label: CONTENT_PROFILES[key].label }));
export const PROJECT_CONTENT_PROFILE_OPTIONS = CONTENT_PROFILE_OPTIONS.filter(({ value }) => ["industry_explainer", "best_of", "comparison", "buying_guide", "how_to", "thought_leadership", "white_paper"].includes(value));

export function isContentProfile(value: unknown): value is ContentProfile {
  return typeof value === "string" && CONTENT_PROFILE_KEYS.includes(value as ContentProfile);
}

export function normalizeContentProfile(value: unknown): ContentProfile | undefined {
  return isContentProfile(value) ? value : undefined;
}

export function resolveContentProfile(articleProfile?: ContentProfile | null, projectProfile?: ContentProfile | null): ContentProfile {
  return articleProfile ?? projectProfile ?? "industry_explainer";
}
