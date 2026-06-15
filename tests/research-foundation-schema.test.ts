import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync("db/migrations/0002_research_foundation.sql", "utf8");

test("research foundation migration creates first-class research tables", () => {
  for (const table of ["research_runs", "research_findings", "source_citations"]) {
    assert.match(migration, new RegExp(`create table if not exists ${table}`));
  }

  assert.match(migration, /alter table research_sources add column if not exists source_key text/);
  assert.match(migration, /alter table research_sources alter column research_pack_id drop not null/);
  assert.match(migration, /alter table research_sources alter column article_id drop not null/);
});

test("research foundation keeps project tenancy and reusable sources", () => {
  for (const table of ["research_runs", "research_findings", "source_citations"]) {
    const body = tableBody(table);
    assert.match(body, /organisation_id text not null/);
    assert.match(body, /project_id text not null/);
  }

  assert.match(migration, /research_sources_project_source_key_idx/);
  assert.match(migration, /research_sources_project_url_idx/);
  assert.match(tableBody("research_runs"), /article_id text/);
  assert.match(tableBody("research_runs"), /research_pack_id text references research_packs\(id\) on delete set null/);
});

test("research findings and citations can be queried independently of articles", () => {
  assert.match(tableBody("research_findings"), /finding_type text not null/);
  assert.match(tableBody("research_findings"), /content text not null/);
  assert.match(tableBody("source_citations"), /article_id text/);
  assert.match(tableBody("source_citations"), /source_id text not null references research_sources\(id\) on delete cascade/);
  assert.match(migration, /research_findings_project_idx/);
  assert.match(migration, /source_citations_source_idx/);
});

function tableBody(table: string) {
  const match = migration.match(new RegExp(`create table if not exists ${table} \\(([^;]+)\\);`, "s"));
  assert.ok(match, `Expected table ${table} to exist.`);
  return match[1];
}
