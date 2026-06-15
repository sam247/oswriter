import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync("db/migrations/0004_generation_telemetry.sql", "utf8");

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

test("generation telemetry is tenant scoped and idempotent by article", () => {
  const body = tableBody("generation_telemetry");

  assert.match(body, /organisation_id text not null references organisations\(id\) on delete cascade/);
  assert.match(body, /project_id text not null references projects\(id\) on delete cascade/);
  assert.match(body, /article_id text not null references articles\(id\) on delete cascade/);
  assert.match(body, /unique \(organisation_id, project_id, article_id\)/);
  assert.match(migration, /generation_telemetry_project_updated_idx/);
  assert.match(migration, /generation_telemetry_article_idx/);
});

function tableBody(table: string) {
  const match = migration.match(new RegExp(`create table if not exists ${table} \\(([^;]+)\\);`, "s"));
  assert.ok(match, `Expected table ${table} to exist.`);
  return match[1];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
