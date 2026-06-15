import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const schema = readFileSync("db/migrations/0001_neon_foundation.sql", "utf8");

test("neon foundation schema includes organisation-first tenancy", () => {
  for (const table of [
    "organisations",
    "organisation_settings",
    "users",
    "organisation_users",
    "projects",
    "project_settings",
    "jobs",
    "articles",
    "research_packs",
    "research_sources",
    "worker_leases",
    "timing_events",
    "debug_events",
    "document_versions",
    "provider_requests",
    "exports",
    "usage_events"
  ]) {
    assert.match(schema, new RegExp(`create table if not exists ${table}`));
  }
});

test("operational tables carry organisation_id and project-scoped tables carry project_id", () => {
  for (const table of [
    "projects",
    "project_settings",
    "jobs",
    "articles",
    "research_packs",
    "research_sources",
    "worker_leases",
    "timing_events",
    "debug_events",
    "document_versions",
    "provider_requests",
    "exports",
    "usage_events"
  ]) {
    const body = tableBody(table);
    assert.match(body, /organisation_id text/);
  }

  for (const table of ["jobs", "articles", "research_packs", "research_sources", "worker_leases", "document_versions", "provider_requests", "exports", "usage_events"]) {
    const body = tableBody(table);
    assert.match(body, /project_id text/);
  }
});

test("foundation schema keeps required migration affordances", () => {
  assert.match(tableBody("jobs"), /status_reason text/);
  assert.match(tableBody("articles"), /status_reason text/);
  assert.match(tableBody("articles"), /markdown text not null/);
  assert.match(tableBody("articles"), /current_version_number integer not null default 1/);
  assert.match(tableBody("projects"), /created_by_user_id text not null/);
  assert.match(tableBody("jobs"), /created_by_user_id text not null/);
  assert.match(tableBody("articles"), /created_by_user_id text not null/);
  assert.match(tableBody("api_keys"), /created_by_user_id text not null/);
  assert.match(tableBody("exports"), /created_by_user_id text not null/);
  assert.match(tableBody("document_versions"), /unique \(organisation_id, project_id, document_type, document_id, version_number\)/);
  assert.match(schema, /primary key \(organisation_id, project_id, queue_name\)/);
});

test("usage events and provider requests are separate ledgers", () => {
  assert.match(tableBody("usage_events"), /event_type text not null/);
  assert.match(tableBody("usage_events"), /estimated_cost numeric/);
  assert.match(tableBody("provider_requests"), /request_type text not null/);
  assert.match(tableBody("provider_requests"), /duration_ms integer/);
  assert.match(tableBody("provider_requests"), /success boolean not null default false/);
});

function tableBody(table: string) {
  const match = schema.match(new RegExp(`create table if not exists ${table} \\(([^;]+)\\);`, "s"));
  assert.ok(match, `Expected table ${table} to exist.`);
  return match[1];
}
