import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const schema = readFileSync("db/migrations/0018_wordpress_publishing.sql", "utf8");

test("WordPress publishing migration adds a project-scoped connection table", () => {
  assert.match(schema, /create table if not exists project_wordpress_connections/i);
  assert.match(schema, /project_id text primary key references projects\(id\) on delete cascade/i);
  assert.match(schema, /organisation_id text not null references organisations\(id\) on delete cascade/i);
  assert.match(schema, /created_by_user_id text not null references users\(id\)/i);
});

test("WordPress publishing migration stores encrypted credentials and publishing defaults", () => {
  assert.match(schema, /encrypted_application_password text not null/i);
  assert.match(schema, /connection_status text not null default 'not_connected'/i);
  assert.match(schema, /default_post_status text not null default 'draft'/i);
  assert.match(schema, /default_category text/i);
  assert.match(schema, /document jsonb not null/i);
});
