import type { NeonUsageSnapshotDocument } from "@/lib/types";
import type { WorkspaceStore } from "@/lib/storage/storage";

const BILLING_MONTH_HOURS = 744;
const BYTES_PER_GB = 1_000_000_000;

const METRICS = [
  "compute_unit_seconds",
  "root_branch_bytes_month",
  "child_branch_bytes_month",
  "instant_restore_bytes_month",
  "extra_branches_month",
  "public_network_transfer_bytes",
  "private_network_transfer_bytes"
] as const;

export async function collectDailyNeonUsageSnapshots(store: WorkspaceStore, date = previousUtcDate()) {
  const config = usageConfig();
  if (!config) {
    return {
      ok: false,
      status: "skipped" as const,
      reason: "NEON_API_KEY and NEON_ORG_ID are required for usage snapshots."
    };
  }

  const response = await fetch(neonUsageUrl(config, date), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    cache: "no-store"
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Neon usage API failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const payload = await response.json() as NeonUsageApiResponse;
  const snapshots = buildSnapshots(payload, config, date);
  for (const snapshot of snapshots) {
    await store.saveNeonUsageSnapshot(snapshot);
  }

  return {
    ok: true,
    status: "collected" as const,
    snapshots: snapshots.length,
    date
  };
}

interface UsageConfig {
  apiKey: string;
  orgId: string;
  baseUrl: string;
  projectIds: string[];
}

interface NeonUsageApiResponse {
  projects?: Array<{
    project_id?: string;
    name?: string;
    periods?: Array<{
      period_plan?: string;
      period_start?: string;
      consumption?: Array<{
        timeframe_start?: string;
        timeframe_end?: string;
        metrics?: Array<{
          metric_name?: string;
          value?: number;
        }>;
      }>;
    }>;
  }>;
}

export function buildSnapshots(payload: NeonUsageApiResponse, config: UsageConfig, date: string) {
  const snapshots: NeonUsageSnapshotDocument[] = [];
  const capturedAt = new Date().toISOString();

  for (const project of payload.projects ?? []) {
    const projectId = stringOrNull(project.project_id);
    if (!projectId) continue;

    for (const period of project.periods ?? []) {
      for (const item of period.consumption ?? []) {
        const timeframeStart = stringOrNull(item.timeframe_start);
        const timeframeEnd = stringOrNull(item.timeframe_end);
        if (!timeframeStart || !timeframeEnd || timeframeStart.slice(0, 10) !== date) continue;

        const metricValues = Object.fromEntries(METRICS.map((name) => [name, 0]));
        for (const metric of item.metrics ?? []) {
          const name = stringOrNull(metric.metric_name);
          if (!name || !(name in metricValues)) continue;
          metricValues[name as keyof typeof metricValues] = number(metric.value);
        }

        const plan = normalizePlan(period.period_plan);
        const pricing = pricingForPlan(plan);
        const computeCuHours = metricValues.compute_unit_seconds / 3600;
        const rootStorageGbMonths = metricValues.root_branch_bytes_month / BILLING_MONTH_HOURS / BYTES_PER_GB;
        const childStorageGbMonths = metricValues.child_branch_bytes_month / BILLING_MONTH_HOURS / BYTES_PER_GB;
        const instantRestoreGbMonths = metricValues.instant_restore_bytes_month / BILLING_MONTH_HOURS / BYTES_PER_GB;
        const publicTransferGb = metricValues.public_network_transfer_bytes / BYTES_PER_GB;
        const privateTransferGb = metricValues.private_network_transfer_bytes / BYTES_PER_GB;
        const extraBranchesMonths = metricValues.extra_branches_month / BILLING_MONTH_HOURS;
        const estimatedComputeCostUsd = roundUsd(computeCuHours * pricing.computeCuHour);
        const estimatedStorageCostUsd = roundUsd((rootStorageGbMonths + childStorageGbMonths) * pricing.storageGbMonth);
        const estimatedInstantRestoreCostUsd = roundUsd(instantRestoreGbMonths * pricing.instantRestoreGbMonth);
        const estimatedPublicTransferCostUsd = roundUsd(publicTransferGb * pricing.publicTransferGb);
        const estimatedPrivateTransferCostUsd = roundUsd(privateTransferGb * pricing.privateTransferGb);
        const estimatedExtraBranchesCostUsd = roundUsd(extraBranchesMonths * pricing.extraBranchesMonth);

        snapshots.push({
          id: snapshotId(projectId, timeframeStart),
          neonOrgId: config.orgId,
          neonProjectId: projectId,
          neonProjectName: stringOrNull(project.name),
          granularity: "daily",
          timeframeStart,
          timeframeEnd,
          periodPlan: plan,
          source: "neon_api_v2",
          capturedAt,
          computeUnitSeconds: roundNumber(metricValues.compute_unit_seconds),
          computeCuHours: roundNumber(computeCuHours),
          rootBranchByteHours: roundNumber(metricValues.root_branch_bytes_month),
          rootStorageGbMonths: roundNumber(rootStorageGbMonths),
          childBranchByteHours: roundNumber(metricValues.child_branch_bytes_month),
          childStorageGbMonths: roundNumber(childStorageGbMonths),
          instantRestoreByteHours: roundNumber(metricValues.instant_restore_bytes_month),
          instantRestoreGbMonths: roundNumber(instantRestoreGbMonths),
          publicNetworkTransferBytes: roundNumber(metricValues.public_network_transfer_bytes),
          publicTransferGb: roundNumber(publicTransferGb),
          privateNetworkTransferBytes: roundNumber(metricValues.private_network_transfer_bytes),
          privateTransferGb: roundNumber(privateTransferGb),
          extraBranchesHours: roundNumber(metricValues.extra_branches_month),
          extraBranchesMonths: roundNumber(extraBranchesMonths),
          estimatedComputeCostUsd,
          estimatedStorageCostUsd,
          estimatedInstantRestoreCostUsd,
          estimatedPublicTransferCostUsd,
          estimatedPrivateTransferCostUsd,
          estimatedExtraBranchesCostUsd,
          estimatedTotalCostUsd: roundUsd(
            estimatedComputeCostUsd
            + estimatedStorageCostUsd
            + estimatedInstantRestoreCostUsd
            + estimatedPublicTransferCostUsd
            + estimatedPrivateTransferCostUsd
            + estimatedExtraBranchesCostUsd
          ),
          pricingSource: `neon_usage_based_${plan}_pricing_2026-06`,
          notes: "Daily estimates use Neon billable metrics. Public transfer and extra branch estimates are gross values and may overstate billed cost when plan allowances still apply.",
          metadata: {
            periodStart: stringOrNull(period.period_start),
            metrics: metricValues,
            requestedProjectIds: config.projectIds
          },
          createdAt: capturedAt,
          updatedAt: capturedAt
        });
      }
    }
  }

  return snapshots.sort((left, right) => left.timeframeStart.localeCompare(right.timeframeStart) || left.neonProjectId.localeCompare(right.neonProjectId));
}

function neonUsageUrl(config: UsageConfig, date: string) {
  const from = `${date}T00:00:00.000Z`;
  const to = `${shiftDate(date, 1)}T00:00:00.000Z`;
  const url = new URL("/api/v2/consumption_history/v2/projects", config.baseUrl);
  url.searchParams.set("org_id", config.orgId);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("granularity", "daily");
  url.searchParams.set("metrics", METRICS.join(","));
  url.searchParams.set("limit", "100");
  if (config.projectIds.length) url.searchParams.set("project_ids", config.projectIds.join(","));
  return url.toString();
}

function usageConfig(): UsageConfig | null {
  const apiKey = process.env.NEON_API_KEY?.trim();
  const orgId = process.env.NEON_ORG_ID?.trim();
  if (!apiKey || !orgId) return null;
  const projectIds = [
    ...(process.env.NEON_PROJECT_ID ? [process.env.NEON_PROJECT_ID] : []),
    ...String(process.env.NEON_PROJECT_IDS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  ];
  return {
    apiKey,
    orgId,
    baseUrl: process.env.NEON_API_BASE_URL?.trim() || "https://console.neon.tech",
    projectIds: [...new Set(projectIds)]
  };
}

function snapshotId(projectId: string, timeframeStart: string) {
  return `neon_${projectId}_${timeframeStart.slice(0, 10)}`;
}

function previousUtcDate() {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - 1);
  return now.toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function pricingForPlan(plan: string) {
  if (plan === "launch") {
    return {
      computeCuHour: 0.106,
      storageGbMonth: 0.35,
      instantRestoreGbMonth: 0.2,
      publicTransferGb: 0.1,
      privateTransferGb: 0,
      extraBranchesMonth: 1.5
    };
  }
  return {
    computeCuHour: 0.222,
    storageGbMonth: 0.35,
    instantRestoreGbMonth: 0.2,
    publicTransferGb: 0.1,
    privateTransferGb: 0.01,
    extraBranchesMonth: 1.5
  };
}

function normalizePlan(value: string | null) {
  const plan = (value ?? "").trim().toLowerCase();
  if (plan === "launch" || plan === "scale" || plan === "agent" || plan === "enterprise") return plan;
  return "scale";
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function roundNumber(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundUsd(value: number) {
  return roundNumber(value);
}
