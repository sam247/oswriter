import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const schema = readFileSync("db/migrations/0019_site_knowledge.sql", "utf8");

test("site knowledge migration creates project-scoped import and page tables", () => {
  assert.match(schema, /create table if not exists project_site_knowledge/i);
  assert.match(schema, /create table if not exists project_site_pages/i);
  assert.match(schema, /project_id text primary key references projects\(id\) on delete cascade/i);
  assert.match(schema, /organisation_id text not null references organisations\(id\) on delete cascade/i);
});

test("site knowledge migration stores lightweight page metadata for future semantic layers", () => {
  assert.match(schema, /sitemap_url text not null/i);
  assert.match(schema, /status text not null default 'not_configured'/i);
  assert.match(schema, /pages_indexed integer not null default 0/i);
  assert.match(schema, /url text not null/i);
  assert.match(schema, /title text not null default ''/i);
  assert.match(schema, /h1 text/i);
  assert.match(schema, /meta_description text/i);
  assert.match(schema, /short_summary text/i);
  assert.match(schema, /metadata jsonb not null default '\{\}'::jsonb/i);
  assert.match(schema, /document jsonb not null/i);
});
