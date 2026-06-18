import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync("db/migrations/0004_generation_telemetry.sql", "utf8");
const expansion = readFileSync("db/migrations/0005_telemetry_expansion.sql", "utf8");
const profileMigration = readFileSync("db/migrations/0006_project_identity_profile.sql", "utf8");
const planningMigration = readFileSync("db/migrations/0007_planning_diagnostics.sql", "utf8");
const breadthMigration = readFileSync("db/migrations/0008_topic_breadth_diagnostics.sql", "utf8");
const costMigration = readFileSync("db/migrations/0009_article_cost_telemetry.sql", "utf8");

test("generation telemetry migration creates article-level cost table", () => {
  const body = tableBody("generation_telemetry");

  for (const column of [
    "organisation_id text not null",
    "project_id text not null",
    "article_id text not null",
    "model text",
    "input_tokens integer not null default 0",
    "output_tokens integer not null default 0",
    "estimated_ai_cost_usd numeric not null default 0",
    "exa_search_calls integer not null default 0",
    "exa_content_calls integer not null default 0",
    "estimated_research_cost_usd numeric not null default 0",
    "total_cost_usd numeric not null default 0",
    "generation_duration_ms integer"
  ]) {
    assert.match(body, new RegExp(escapeRegExp(column)));
  }
});

test("project identity migration adds profile telemetry and project backfill", () => {
  for (const column of [
    "profile_version integer not null default 0",
    "region text",
    "industry text",
    "audience text",
    "profile_relevance_score integer",
    "region_awareness_active boolean not null default false",
    "industry_awareness_active boolean not null default false",
    "audience_awareness_active boolean not null default false"
  ]) {
    assert.match(profileMigration, new RegExp(escapeRegExp(column)));
  }
  assert.match(profileMigration, /generation_telemetry_profile_idx/);
  assert.match(profileMigration, /jsonb_set\(\s*projects\.document,\s*'\{profile\}'/);
});

test("generation telemetry expansion captures usage quality and cost inputs", () => {
  for (const column of [
    "created_by_user_id text",
    "target_words integer not null default 0",
    "actual_words integer not null default 0",
    "planned_sections integer not null default 0",
    "actual_sections integer not null default 0",
    "finish_reason text",
    "review_status text not null default 'generated'",
    "research_duration_ms integer",
    "sources_discovered integer not null default 0",
    "sources_accepted integer not null default 0",
    "sources_rejected integer not null default 0",
    "findings_extracted integer not null default 0",
    "useful_facts_extracted integer not null default 0",
    "citations_generated integer not null default 0",
    "research_tokens integer not null default 0",
    "generation_tokens integer not null default 0"
  ]) {
    assert.match(expansion, new RegExp(escapeRegExp(column)));
  }
});

test("planning diagnostics migration adds planner observability columns", () => {
  for (const column of [
    "planned_h2_count integer not null default 0",
    "planned_h3_count integer not null default 0",
    "expected_depth text",
    "actual_h2_count integer not null default 0",
    "actual_h3_count integer not null default 0",
    "actual_depth text",
    "h2_achievement_percent numeric(6,2)",
    "h3_achievement_percent numeric(6,2)",
    "target_achievement_percent numeric(6,2)",
    "planner_outcome text"
  ]) {
    assert.match(planningMigration, new RegExp(escapeRegExp(column)));
  }
  assert.match(planningMigration, /generation_telemetry_planning_idx/);
  assert.match(planningMigration, /metadata #>> '\{planningDiagnostics,expectedDepth\}'/);
});

test("topic breadth diagnostics migration adds concept coverage telemetry", () => {
  for (const column of [
    "research_concept_count integer not null default 0",
    "research_concepts jsonb not null default '[]'::jsonb",
    "planned_breadth_ratio numeric(6,2)",
    "actual_breadth_coverage integer not null default 0",
    "actual_breadth_coverage_percent numeric(6,2)",
    "breadth_status text"
  ]) {
    assert.match(breadthMigration, new RegExp(escapeRegExp(column)));
  }
  assert.match(breadthMigration, /generation_telemetry_breadth_idx/);
  assert.match(breadthMigration, /planningDiagnostics,researchConcepts/);
});

test("article cost telemetry migration adds actual usage and derived cost columns", () => {
  for (const column of [
    "generation_provider text",
    "generation_model text",
    "total_tokens integer not null default 0",
    "estimated_generation_cost_usd numeric not null default 0",
    "exa_search_requests integer not null default 0",
    "exa_content_pages integer not null default 0",
    "estimated_exa_search_cost_usd numeric not null default 0",
    "estimated_exa_content_cost_usd numeric not null default 0",
    "total_duration_ms integer",
    "cost_per_word numeric not null default 0",
    "cost_per_research_concept numeric not null default 0",
    "cost_per_source numeric not null default 0"
  ]) {
    assert.match(costMigration, new RegExp(escapeRegExp(column)));
  }
  assert.match(costMigration, /generation_telemetry_cost_idx/);
});

test("profile key telemetry migration supports profile combination analysis", () => {
  const sql = readFileSync("db/migrations/0011_profile_key_telemetry.sql", "utf8").toLowerCase();

  assert.match(sql, /add column if not exists profile_key text/);
  assert.match(sql, /generation_telemetry_profile_key_idx/);
});

test("telemetry export status tracks Google Sheets delivery separately", () => {
  const body = tableBodyFrom(expansion, "telemetry_export_status");

  for (const column of [
    "id text primary key",
    "organisation_id text not null references organisations(id) on delete cascade",
    "export_type text not null",
    "export_key text not null",
    "target_sheet text not null",
    "status text not null default 'pending'",
    "attempts integer not null default 0",
    "last_error text",
    "exported_at timestamptz"
  ]) {
    assert.match(body, new RegExp(escapeRegExp(column)));
  }
  assert.match(expansion, /unique \(organisation_id, export_type, export_key, target_sheet\)/);
  assert.match(expansion, /telemetry_export_status_pending_idx/);
});

test("generation telemetry is tenant scoped and idempotent by article", () => {
  const body = tableBody("generation_telemetry");

  assert.match(body, /organisation_id text not null references organisations\(id\) on delete cascade/);
  assert.match(body, /project_id text not null references projects\(id\) on delete cascade/);
  assert.match(body, /article_id text not null references articles\(id\) on delete cascade/);
  assert.match(body, /unique \(organisation_id, project_id, article_id\)/);
  assert.match(migration, /generation_telemetry_project_updated_idx/);
  assert.match(migration, /generation_telemetry_article_idx/);
});

test("telemetry quality migration stores score and band", () => {
  const sql = readFileSync("db/migrations/0012_telemetry_quality_score.sql", "utf8").toLowerCase();

  assert.match(sql, /quality_score integer not null default 0/);
  assert.match(sql, /quality_band text not null default 'poor'/);
});

function tableBody(table: string) {
  return tableBodyFrom(migration, table);
}

function tableBodyFrom(sql: string, table: string) {
  const match = sql.match(new RegExp(`create table if not exists ${table} \\(([^;]+)\\);`, "s"));
  assert.ok(match, `Expected table ${table} to exist.`);
  return match[1];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
