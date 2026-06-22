import type { ContentProfile } from "@/lib/content-profiles";

export type HarperTelemetryCategory = "grammar" | "style" | "readability" | "spelling" | "usage";
export type HarperTelemetryAction = "shown" | "accepted" | "ignored";

export interface HarperTelemetryEventInput {
  article_id: string;
  content_profile?: ContentProfile | string | null;
  rule_id: string;
  suggestion_id: string;
  category: HarperTelemetryCategory;
  action: HarperTelemetryAction;
  timestamp: string;
}

export interface HarperRuleMetric {
  rule_id: string;
  category: HarperTelemetryCategory;
  total_occurrences: number;
  accepted_count: number;
  ignored_count: number;
  acceptance_rate: number;
  ignore_rate: number;
}

export interface HarperContentProfileMetric {
  content_profile: string;
  total_suggestions: number;
  accepted_count: number;
  ignored_count: number;
  acceptance_rate: number;
  ignore_rate: number;
}

export interface HarperTopRuleMetric {
  rule_id: string;
  category: HarperTelemetryCategory;
  total_occurrences: number;
  accepted_count: number;
  ignored_count: number;
  acceptance_rate: number;
  ignore_rate: number;
}

export interface HarperTelemetrySummary {
  total_suggestions: number;
  accepted_suggestions: number;
  ignored_suggestions: number;
  acceptance_rate: number;
  ignore_rate: number;
  top_helpful_rule: HarperTopRuleMetric | null;
  top_ignored_rule: HarperTopRuleMetric | null;
}

export interface HarperTelemetryReport {
  summary: HarperTelemetrySummary;
  rule_metrics: HarperRuleMetric[];
  noisy_rules: HarperRuleMetric[];
  content_profile_metrics: HarperContentProfileMetric[];
}

export function emptyHarperTelemetryReport(): HarperTelemetryReport {
  return {
    summary: {
      total_suggestions: 0,
      accepted_suggestions: 0,
      ignored_suggestions: 0,
      acceptance_rate: 0,
      ignore_rate: 0,
      top_helpful_rule: null,
      top_ignored_rule: null
    },
    rule_metrics: [],
    noisy_rules: [],
    content_profile_metrics: []
  };
}
