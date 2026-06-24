"use client";

import { Check, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { applySeoRecommendations, buildSeoDecisionEngine, type SeoRecommendation, type SeoRecommendationSection } from "@/lib/seo/decision-engine";
import type { ArticleDocument, ProjectProfile, ResearchPack } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SeoDecisionPanelProps {
  article: ArticleDocument;
  markdown: string;
  research?: ResearchPack | null;
  profile?: ProjectProfile | null;
  onApplyMarkdown: (markdown: string) => void;
  onNotify?: (message: string) => void;
}

interface PreviewState {
  title: string;
  actionLabel: string;
  recommendations: SeoRecommendation[];
}

const SECTIONS: Array<{ key: SeoRecommendationSection; label: string }> = [
  { key: "fix", label: "Fix" },
  { key: "improve", label: "Improve" },
  { key: "project", label: "Project" }
];

export function SeoDecisionPanel({ article, markdown, research, profile, onApplyMarkdown, onNotify }: SeoDecisionPanelProps) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const decision = useMemo(
    () => buildSeoDecisionEngine({ article, markdown, research, profile }),
    [article, markdown, research, profile]
  );
  const priorityRecommendations = decision.recommendations.slice(0, 3);

  function openPreview(recommendations: SeoRecommendation[], title: string, actionLabel: string) {
    setPreview({ recommendations, title, actionLabel });
  }

  function applyPreview() {
    if (!preview) return;
    onApplyMarkdown(applySeoRecommendations(markdown, preview.recommendations));
    if (preview.recommendations.some((item) => item.id === "insert-statistics")) onNotify?.("Statistic added");
    if (preview.recommendations.some((item) => item.id === "insert-findings")) onNotify?.("Research finding added");
    if (preview.recommendations.some((item) => item.id === "add-example")) onNotify?.("Example added");
    if (preview.recommendations.some((item) => item.id === "cite-sources")) onNotify?.("Citations inserted");
    if (preview.recommendations.some((item) => item.id === "insert-citation-list")) onNotify?.("References added");
    setPreview(null);
  }

  async function applyRecommendation(recommendation: SeoRecommendation) {
    if (runningActionId) return;
    if (!isDirectInsertionAction(recommendation.id)) {
      openPreview([recommendation], recommendation.title, recommendation.actionLabel);
      return;
    }

    setRunningActionId(recommendation.id);
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    onApplyMarkdown(recommendation.apply(markdown));
    onNotify?.(successLabelForRecommendation(recommendation.id));
    setRunningActionId(null);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-line bg-surface-1 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-subtle">Article Score</div>
            <div className="mono mt-1 text-3xl font-semibold leading-none text-ink">{decision.score}</div>
          </div>
          {priorityRecommendations.length > 0 && (
            <button
              type="button"
              onClick={() => openPreview(priorityRecommendations, `Improve score to ${decision.targetScore}`, "Apply All")}
              className="rounded-md bg-ink px-2.5 py-1.5 text-[11px] font-medium text-white"
            >
              Apply All
            </button>
          )}
        </div>

        {priorityRecommendations.length > 0 ? (
          <div className="mt-3 border-t border-line pt-3">
            <div className="text-[11.5px] font-medium text-ink">To reach {decision.targetScore}:</div>
            <div className="mt-2 space-y-1.5">
              {priorityRecommendations.map((item) => (
                <div key={item.id} className="flex items-start gap-2 text-[11px] leading-snug text-ink-muted">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" />
                  <span>{item.title}</span>
                </div>
              ))}
            </div>
            <div className="mono mt-2 text-[10.5px] text-ink-subtle">Estimated impact: +{decision.estimatedImpact} points</div>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[11.5px] text-success">
            <Check className="size-3.5" /> No actionable SEO issues detected.
          </div>
        )}
      </section>

      {SECTIONS.map((section) => {
        const recommendations = decision.recommendations.filter((item) => item.section === section.key);
        if (!recommendations.length) return null;
        return (
          <section key={section.key}>
            <div className="mono mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">{section.label}</div>
            <div className="space-y-2">
              {recommendations.map((recommendation, index) => (
                <article key={recommendation.id} className={cn("rounded-md border border-line bg-surface-1 p-3", index === 0 && section.key === decision.recommendations[0]?.section && "border-line-strong") }>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold leading-snug text-ink">{recommendation.title}</div>
                      <p className="mt-1 text-[11.5px] leading-snug text-ink-muted">{recommendation.reason}</p>
                      <div className="mono mt-2 text-[10px] text-ink-subtle">+{recommendation.impact} points</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openPreview([recommendation], recommendation.title, recommendation.actionLabel)}
                      className="rounded-md border border-line bg-background px-2 py-1 text-[11px] font-medium text-ink hover:bg-surface-3"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => void applyRecommendation(recommendation)}
                      disabled={runningActionId === recommendation.id}
                      className="rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-white"
                    >
                      {runningActionId === recommendation.id ? loadingLabelForRecommendation(recommendation.id) : recommendation.actionLabel}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}

      {preview && (
        <section className="rounded-lg border border-line-strong bg-surface-1 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mono text-[9.5px] uppercase tracking-[0.16em] text-ink-subtle">Preview</div>
              <div className="mt-1 text-[12.5px] font-semibold text-ink">{preview.title}</div>
            </div>
            <button type="button" onClick={() => setPreview(null)} className="rounded px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-3">Close</button>
          </div>
          <PreviewBlock label="Current text" text={preview.recommendations.map((item) => item.currentText).join("\n\n")} />
          <PreviewBlock label="Proposed text" text={preview.recommendations.map((item) => item.proposedText).join("\n\n")} />
          <PreviewBlock label="Difference" text={preview.recommendations.map((item) => item.difference).join("\n\n")} diff />
          <button type="button" onClick={applyPreview} className="mt-3 h-8 w-full rounded-md bg-ink text-[11.5px] font-medium text-white">
            {preview.actionLabel}
          </button>
        </section>
      )}
    </div>
  );
}

function isDirectInsertionAction(id: string) {
  return id === "insert-statistics" || id === "insert-findings" || id === "add-example" || id === "cite-sources" || id === "insert-citation-list";
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
  return "Statistic added";
}

function PreviewBlock({ label, text, diff = false }: { label: string; text: string; diff?: boolean }) {
  return (
    <div className="mt-3">
      <div className="mono text-[9.5px] uppercase tracking-[0.14em] text-ink-subtle">{label}</div>
      <pre className={cn("mono mt-1 max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-background p-2.5 text-[10.5px] leading-relaxed text-ink-muted", diff && "text-success")}>{text}</pre>
    </div>
  );
}
