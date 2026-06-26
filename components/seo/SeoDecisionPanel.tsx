"use client";

import { Check, CheckCircle2, ChevronDown, ChevronUp, Circle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  applySeoRecommendations,
  applySelectedInternalLinks,
  buildSeoDecisionEngine,
  type SeoInternalLinkOpportunity,
  type SeoRecommendation,
  type SeoRecommendationSection
} from "@/lib/seo/decision-engine";
import type { ArticleDocument, ProjectProfile, ProjectSiteProfileDocument, ResearchPack, SiteKnowledgePageDocument } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SeoDecisionPanelProps {
  article: ArticleDocument;
  markdown: string;
  research?: ResearchPack | null;
  profile?: ProjectProfile | null;
  projectId?: string;
  onApplyMarkdown: (markdown: string) => void;
  onNotify?: (message: string) => void;
}

interface TrackedRecommendation {
  id: string;
  title: string;
}

interface WebsiteIntelligenceState {
  pages: SiteKnowledgePageDocument[];
  profile: ProjectSiteProfileDocument | null;
}

interface RecommendationGroup {
  key: "critical" | "recommended" | "optional";
  label: string;
  description: string;
}

const SECTION_GROUPS: RecommendationGroup[] = [
  { key: "critical", label: "Critical", description: "Required before publishing" },
  { key: "recommended", label: "Recommended", description: "Improves quality" },
  { key: "optional", label: "Optional", description: "Lower impact improvements" }
];

const BULK_PREVIEW_KEY = "bulk-safe-fixes";

export function SeoDecisionPanel({ article, markdown, research, profile, projectId, onApplyMarkdown, onNotify }: SeoDecisionPanelProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [trackedArticleId, setTrackedArticleId] = useState(article.id);
  const [trackedRecommendations, setTrackedRecommendations] = useState<TrackedRecommendation[]>([]);
  const [selectedRecommendations, setSelectedRecommendations] = useState<Record<string, boolean>>({});
  const [selectedInternalLinks, setSelectedInternalLinks] = useState<Record<string, boolean>>({});
  const [websiteIntelligence, setWebsiteIntelligence] = useState<WebsiteIntelligenceState>({ pages: [], profile: null });
  const decision = useMemo(
    () => buildSeoDecisionEngine({
      article,
      markdown,
      research,
      profile,
      sitePages: websiteIntelligence.pages,
      siteProfile: websiteIntelligence.profile
    }),
    [article, markdown, research, profile, websiteIntelligence]
  );
  const priorityRecommendations = useMemo(() => decision.recommendations.slice(0, 3), [decision.recommendations]);
  const safeRecommendations = useMemo(
    () => decision.recommendations.filter((item) => item.id !== "suggest-internal-links").slice(0, 3),
    [decision.recommendations]
  );
  const currentRecommendationIds = useMemo(() => new Set(decision.recommendations.map((item) => item.id)), [decision.recommendations]);
  const trackedProgressItems = trackedRecommendations.map((item) => ({
    ...item,
    completed: !currentRecommendationIds.has(item.id)
  }));
  const hasProgressItems = trackedProgressItems.length > 0;
  const totalRemaining = decision.recommendations.length;
  const estimatedCompletionSeconds = useMemo(
    () => decision.recommendations.reduce((sum, recommendation) => sum + estimateRecommendationSeconds(recommendation), 0),
    [decision.recommendations]
  );
  const groupedRecommendations = useMemo(
    () => SECTION_GROUPS.map((group) => ({
      ...group,
      recommendations: decision.recommendations.filter((recommendation) => recommendationGroupKey(recommendation) === group.key)
    })).filter((group) => group.recommendations.length > 0),
    [decision.recommendations]
  );
  const internalLinkRecommendation = decision.recommendations.find((item) => item.id === "suggest-internal-links") ?? null;
  const internalLinkOpportunities = extractInternalLinkOpportunities(internalLinkRecommendation);
  const selectedInternalLinkOpportunities = internalLinkOpportunities.filter((item) => selectedInternalLinks[internalLinkKey(item)] ?? true);

  useEffect(() => {
    setTrackedArticleId(article.id);
    setTrackedRecommendations(priorityRecommendations.map(toTrackedRecommendation));
  }, [article.id]);

  useEffect(() => {
    let cancelled = false;
    const resolvedProjectId = projectId ?? article.projectId;

    async function loadWebsiteIntelligence() {
      if (!resolvedProjectId) {
        setWebsiteIntelligence({ pages: [], profile: null });
        return;
      }

      try {
        const [pagesRes, profileRes] = await Promise.all([
          fetch(`/api/project/site-knowledge/pages?projectId=${encodeURIComponent(resolvedProjectId)}`, { cache: "no-store" }),
          fetch(`/api/project/site-knowledge?projectId=${encodeURIComponent(resolvedProjectId)}`, { cache: "no-store" })
        ]);
        const pagesData = await pagesRes.json().catch(() => ({})) as { pages?: SiteKnowledgePageDocument[] };
        const profileData = await profileRes.json().catch(() => ({})) as { siteProfile?: ProjectSiteProfileDocument | null };
        if (!cancelled) {
          setWebsiteIntelligence({
            pages: Array.isArray(pagesData.pages) ? pagesData.pages : [],
            profile: profileData.siteProfile ?? null
          });
        }
      } catch {
        if (!cancelled) setWebsiteIntelligence({ pages: [], profile: null });
      }
    }

    void loadWebsiteIntelligence();
    return () => {
      cancelled = true;
    };
  }, [article.projectId, projectId]);

  useEffect(() => {
    setTrackedRecommendations((current) => {
      if (trackedArticleId !== article.id) return priorityRecommendations.map(toTrackedRecommendation);

      const currentIds = new Set(current.map((item) => item.id));
      const refreshed = current.map((item) => {
        const latest = decision.recommendations.find((recommendation) => recommendation.id === item.id);
        return latest ? toTrackedRecommendation(latest) : item;
      });
      const additions = priorityRecommendations
        .filter((item) => !currentIds.has(item.id))
        .slice(0, Math.max(0, 3 - refreshed.filter((item) => currentRecommendationIds.has(item.id)).length))
        .map(toTrackedRecommendation);
      const next = [...refreshed, ...additions];

      if (sameTrackedRecommendations(current, next)) return current;
      return next;
    });
  }, [article.id, currentRecommendationIds, decision.recommendations, priorityRecommendations, trackedArticleId]);

  useEffect(() => {
    setSelectedRecommendations((current) => {
      const next = Object.fromEntries(decision.recommendations.map((item) => [item.id, current[item.id] ?? true]));
      return sameRecommendationSelection(current, next) ? current : next;
    });
  }, [decision.recommendations]);

  useEffect(() => {
    if (!internalLinkOpportunities.length) {
      setSelectedInternalLinks({});
      return;
    }
    setSelectedInternalLinks((current) => {
      const next = Object.fromEntries(internalLinkOpportunities.map((item) => {
        const key = internalLinkKey(item);
        return [key, current[key] ?? true];
      }));
      return sameLinkSelection(current, next) ? current : next;
    });
  }, [internalLinkOpportunities]);

  useEffect(() => {
    if (!expandedKey) return;
    if (expandedKey === BULK_PREVIEW_KEY && !safeRecommendations.length) {
      setExpandedKey(null);
      return;
    }
    if (expandedKey !== BULK_PREVIEW_KEY && !decision.recommendations.some((item) => item.id === expandedKey)) {
      setExpandedKey(null);
    }
  }, [decision.recommendations, expandedKey, safeRecommendations.length]);

  async function applyRecommendation(recommendation: SeoRecommendation) {
    if (runningActionId) return;
    if (recommendation.id === "suggest-internal-links") {
      if (!selectedInternalLinkOpportunities.length) {
        onNotify?.("Select at least one link to insert");
        return;
      }
      setRunningActionId(recommendation.id);
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      onApplyMarkdown(applySelectedInternalLinks(markdown, selectedInternalLinkOpportunities));
      onNotify?.("Selected internal links inserted");
      setExpandedKey(null);
      setRunningActionId(null);
      return;
    }
    if (!(selectedRecommendations[recommendation.id] ?? true)) {
      onNotify?.("Select the change to apply");
      return;
    }
    setRunningActionId(recommendation.id);
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    onApplyMarkdown(recommendation.apply(markdown));
    onNotify?.(successLabelForRecommendation(recommendation.id));
    setExpandedKey(null);
    setRunningActionId(null);
  }

  async function applySafeFixes() {
    if (runningActionId || !safeRecommendations.length) return;
    setRunningActionId(BULK_PREVIEW_KEY);
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    onApplyMarkdown(applySeoRecommendations(markdown, safeRecommendations));
    onNotify?.(`${safeRecommendations.length} safe fixes applied`);
    setExpandedKey(null);
    setRunningActionId(null);
  }

  function toggleExpanded(key: string) {
    setExpandedKey((current) => current === key ? null : key);
  }

  function toggleRecommendationSelection(recommendation: SeoRecommendation) {
    setSelectedRecommendations((current) => ({
      ...current,
      [recommendation.id]: !(current[recommendation.id] ?? true)
    }));
  }

  function toggleInternalLink(opportunity: SeoInternalLinkOpportunity) {
    const key = internalLinkKey(opportunity);
    setSelectedInternalLinks((current) => ({
      ...current,
      [key]: !(current[key] ?? true)
    }));
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-line bg-surface-1 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-subtle">Article Score</div>
            <div className="mono mt-1 text-3xl font-semibold leading-none text-ink">{decision.score}</div>
          </div>
          {safeRecommendations.length > 0 && (
            <button
              type="button"
              onClick={() => toggleExpanded(BULK_PREVIEW_KEY)}
              className="rounded-md bg-ink px-2.5 py-1.5 text-[11px] font-medium text-white"
            >
              Optimise Article
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <ScoreMetric label="Current" value={decision.score} />
          <ScoreMetric label="Potential" value={decision.targetScore} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <div>
            <div className="text-[11.5px] font-medium text-ink">
              {totalRemaining ? `${totalRemaining} improvement${totalRemaining === 1 ? "" : "s"} remaining` : "No improvements remaining"}
            </div>
            <div className="mono mt-1 text-[10.5px] text-ink-subtle">Estimated completion: {formatEstimate(estimatedCompletionSeconds)}</div>
          </div>
          {safeRecommendations.length > 0 ? (
            <div className="mono text-right text-[10.5px] text-ink-subtle">Safe fixes only</div>
          ) : null}
        </div>

        {hasProgressItems ? (
          <div className="mt-3 border-t border-line pt-3">
            <div className="text-[11.5px] font-medium text-ink">{priorityRecommendations.length ? "Priority checklist" : "Progress"}</div>
            <div className="mt-2 space-y-1.5">
              {trackedProgressItems.map((item) => (
                <div key={item.id} className={cn("flex items-start gap-2 text-[11px] leading-snug", item.completed ? "text-success" : "text-ink-muted")}>
                  {item.completed ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                  ) : (
                    <Circle className="mt-0.5 size-3.5 shrink-0 text-danger" />
                  )}
                  <span>{item.title}</span>
                </div>
              ))}
            </div>
            <div className="mono mt-2 text-[10.5px] text-ink-subtle">
              {priorityRecommendations.length ? `Estimated impact: +${decision.estimatedImpact} points` : "All tracked items complete"}
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[11.5px] text-success">
            <Check className="size-3.5" /> No actionable SEO issues detected.
          </div>
        )}

        {expandedKey === BULK_PREVIEW_KEY && safeRecommendations.length > 0 ? (
          <div className="mt-3 border-t border-line pt-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[12px] font-semibold text-ink">Apply Safe Fixes</div>
                <p className="mt-1 text-[11.5px] leading-snug text-ink-muted">Only deterministic, reversible changes are applied in one pass.</p>
              </div>
              <button type="button" onClick={() => setExpandedKey(null)} className="rounded px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-3">
                Cancel
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {safeRecommendations.map((recommendation) => (
                <div key={recommendation.id} className="rounded-md border border-line bg-background px-2.5 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11.5px] font-medium text-ink">{recommendation.title}</div>
                      <div className="mt-1 text-[10.5px] leading-snug text-ink-muted">{recommendation.reason}</div>
                    </div>
                    <div className="mono shrink-0 text-[10px] text-ink-subtle">+{recommendation.impact}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-3">
              <PreviewBlock label="Current text" text={safeRecommendations.map((item) => item.currentText).join("\n\n")} />
              <PreviewBlock label="Suggested updates" text={safeRecommendations.map((item) => item.proposedText).join("\n\n")} />
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setExpandedKey(null)} className="rounded-md border border-line bg-background px-3 py-1.5 text-[11px] font-medium text-ink">
                Not now
              </button>
              <button
                type="button"
                onClick={() => void applySafeFixes()}
                disabled={runningActionId === BULK_PREVIEW_KEY}
                className="rounded-md bg-ink px-3 py-1.5 text-[11px] font-medium text-white"
              >
                {runningActionId === BULK_PREVIEW_KEY ? "Applying..." : "Apply Safe Fixes"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {groupedRecommendations.map((group) => {
        return (
          <section key={group.key}>
            <div className="mb-2">
              <div className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">{group.label}</div>
              <div className="mt-1 text-[11px] text-ink-muted">{group.description}</div>
            </div>
            <div className="space-y-2">
              {group.recommendations.map((recommendation) => {
                const expanded = expandedKey === recommendation.id;
                const internalLinks = extractInternalLinkOpportunities(recommendation);
                const selectedCount = internalLinks.filter((item) => selectedInternalLinks[internalLinkKey(item)] ?? true).length;
                const isSelected = selectedRecommendations[recommendation.id] ?? true;
                return (
                  <article
                    key={recommendation.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpanded(recommendation.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleExpanded(recommendation.id);
                      }
                    }}
                    className={cn(
                      "rounded-md border border-line bg-surface-1 p-3 text-left transition-colors",
                      expanded && "border-line-strong",
                      !expanded && "hover:bg-surface-2"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold leading-snug text-ink">{recommendation.title}</div>
                        <p className="mt-1 text-[11.5px] leading-snug text-ink-muted">{recommendation.reason}</p>
                        <p className="mt-2 text-[11px] leading-snug text-ink">
                          <span className="font-medium">Outcome:</span> {recommendationOutcome(recommendation)}
                        </p>
                        <div className="mono mt-2 text-[10px] text-ink-subtle">+{recommendation.impact} points</div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2">
                        <div className="text-[11px] font-medium text-ink-muted">{expanded ? "Hide" : "Review"}</div>
                        {expanded ? <ChevronUp className="size-4 text-ink-subtle" /> : <ChevronDown className="size-4 text-ink-subtle" />}
                      </div>

                      {expanded ? (
                        <div className="mt-3 border-t border-line pt-3" onClick={(event) => event.stopPropagation()}>
                          <div className="grid gap-3">
                            {recommendation.id === "suggest-internal-links" ? (
                              <>
                                <div className="mono text-[9.5px] uppercase tracking-[0.14em] text-ink-subtle">{internalLinks.length} opportunities found</div>
                                <div className="space-y-2">
                                  {internalLinks.map((opportunity) => {
                                    const selected = selectedInternalLinks[internalLinkKey(opportunity)] ?? true;
                                    return (
                                      <label
                                        key={internalLinkKey(opportunity)}
                                        className={cn(
                                          "block cursor-pointer rounded-md border border-line bg-background px-3 py-2.5 transition-colors hover:bg-surface-2",
                                          !selected && "opacity-70"
                                        )}
                                      >
                                        <div className="flex items-start gap-2">
                                          <input
                                            type="checkbox"
                                            checked={selected}
                                            onChange={() => toggleInternalLink(opportunity)}
                                            className="mt-0.5 size-4 accent-ink"
                                          />
                                          <div className="min-w-0">
                                            <div className="text-[11.5px] font-semibold text-ink">{opportunity.anchorText}</div>
                                            <div className="mono mt-1 text-[10px] text-ink-subtle">{opportunity.url}</div>
                                            <div className="mt-1 text-[10.5px] leading-snug text-ink-muted">{opportunity.reason}</div>
                                          </div>
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              </>
                            ) : (
                              <>
                                <label className={cn("block cursor-pointer rounded-md border border-line bg-background px-3 py-2.5", !isSelected && "opacity-70")}>
                                  <div className="flex items-start gap-2">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleRecommendationSelection(recommendation)}
                                      className="mt-0.5 size-4 accent-ink"
                                    />
                                    <div className="min-w-0">
                                      <div className="text-[11.5px] font-semibold text-ink">{recommendation.actionLabel}</div>
                                      <div className="mt-1 text-[10.5px] leading-snug text-ink-muted">Include this change when applying.</div>
                                    </div>
                                  </div>
                                </label>
                                <PreviewBlock label="Current text" text={recommendation.currentText} />
                                <PreviewBlock label="Suggested update" text={recommendation.proposedText} />
                              </>
                            )}
                            <div className="rounded-md border border-line bg-background px-3 py-2.5">
                              <div className="mono text-[9.5px] uppercase tracking-[0.14em] text-ink-subtle">Why it matters</div>
                              <p className="mt-1 text-[11px] leading-snug text-ink-muted">{recommendation.reason}</p>
                            </div>
                          </div>

                          <div className="mt-3 border-t border-line pt-3">
                            <div className="mono text-[10px] text-ink-subtle">
                              {recommendation.id === "suggest-internal-links"
                                ? `${selectedCount} of ${internalLinks.length} selected`
                                : `${(isSelected ? 1 : 0)} of 1 selected`}
                            </div>
                            <button
                              type="button"
                              onClick={() => void applyRecommendation(recommendation)}
                              disabled={runningActionId === recommendation.id || (recommendation.id === "suggest-internal-links" ? selectedCount === 0 : !isSelected)}
                              className="mt-2 h-8 w-full rounded-md bg-ink text-[11.5px] font-medium text-white disabled:opacity-60"
                            >
                              {recommendation.id === "suggest-internal-links"
                                ? runningActionId === recommendation.id
                                  ? "Inserting links..."
                                  : "Insert Selected Links"
                                : runningActionId === recommendation.id
                                  ? loadingLabelForRecommendation(recommendation.id)
                                  : "Apply Selected"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function toTrackedRecommendation(recommendation: SeoRecommendation): TrackedRecommendation {
  return {
    id: recommendation.id,
    title: recommendation.title
  };
}

function sameTrackedRecommendations(left: TrackedRecommendation[], right: TrackedRecommendation[]) {
  return left.length === right.length && left.every((item, index) => item.id === right[index]?.id && item.title === right[index]?.title);
}

function sameRecommendationSelection(left: Record<string, boolean>, right: Record<string, boolean>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key]);
}

function recommendationGroupKey(recommendation: SeoRecommendation): RecommendationGroup["key"] {
  if (recommendation.section === "fix") return "critical";
  if (recommendation.section === "improve" || recommendation.id === "suggest-internal-links") return "recommended";
  return "optional";
}

function estimateRecommendationSeconds(recommendation: SeoRecommendation) {
  if (recommendation.id === "suggest-internal-links") return 18;
  if (recommendation.id === "cite-sources") return 12;
  if (recommendation.id === "insert-citation-list") return 8;
  if (recommendation.id === "add-faq") return 14;
  if (recommendation.id === "add-example") return 14;
  return 10;
}

function formatEstimate(totalSeconds: number) {
  if (totalSeconds <= 0) return "0 seconds";
  if (totalSeconds < 60) return `~${Math.max(10, Math.round(totalSeconds / 5) * 5)} seconds`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round((totalSeconds % 60) / 5) * 5;
  return seconds ? `~${minutes}m ${seconds}s` : `~${minutes}m`;
}

function recommendationOutcome(recommendation: SeoRecommendation) {
  if (recommendation.id === "cite-sources") return "Key claims become easier to trust and verify.";
  if (recommendation.id === "insert-citation-list") return "The draft becomes easier to publish and reference-check.";
  if (recommendation.id === "add-cta") return "Readers leave with a clear next step instead of a dead end.";
  if (recommendation.id === "add-faq") return "The article covers more answer-style searches and snippet opportunities.";
  if (recommendation.id === "add-conclusion") return "The ending lands the argument with a clearer takeaway.";
  if (recommendation.id === "add-example") return "Advice becomes easier to act on in a real scenario.";
  if (recommendation.id === "insert-findings") return "The article gains stronger supporting context from existing research.";
  if (recommendation.id === "insert-statistics") return "Sections feel more specific and evidence-led.";
  if (recommendation.id === "suggest-internal-links") return "Relevant pages gain stronger contextual links without inserting everything automatically.";
  return "The article becomes clearer, more complete, and more publish-ready.";
}

function loadingLabelForRecommendation(id: string) {
  if (id === "insert-citation-list") return "Building references...";
  if (id === "cite-sources") return "Adding citations...";
  if (id === "add-example") return "Adding example...";
  if (id === "insert-findings") return "Adding research finding...";
  return "Adding statistic...";
}

function successLabelForRecommendation(id: string) {
  if (id === "insert-citation-list") return "References added";
  if (id === "cite-sources") return "Citations inserted";
  if (id === "add-example") return "Example added";
  if (id === "insert-findings") return "Research finding added";
  if (id === "suggest-internal-links") return "Internal links inserted";
  return "Statistic added";
}

function extractInternalLinkOpportunities(recommendation: SeoRecommendation | null) {
  const value = recommendation?.metadata?.internalLinkOpportunities;
  return Array.isArray(value) ? (value as SeoInternalLinkOpportunity[]) : [];
}

function internalLinkKey(opportunity: SeoInternalLinkOpportunity) {
  return `${opportunity.anchorText}::${opportunity.url}`;
}

function sameLinkSelection(left: Record<string, boolean>, right: Record<string, boolean>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key]);
}

function ScoreMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-background px-2.5 py-2">
      <div className="mono text-[9.5px] uppercase tracking-[0.14em] text-ink-subtle">{label}</div>
      <div className="mono mt-1 text-xl font-semibold leading-none text-ink">{value}</div>
    </div>
  );
}

function PreviewBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mono text-[9.5px] uppercase tracking-[0.14em] text-ink-subtle">{label}</div>
      <pre className="mono mt-1 max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-background p-2.5 text-[10.5px] leading-relaxed text-ink-muted">{text}</pre>
    </div>
  );
}
