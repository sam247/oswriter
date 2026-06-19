import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const migration = readFileSync(new URL("../db/migrations/0013_billing_foundations.sql", import.meta.url), "utf8");

describe("billing schema", () => {
  it("persists provider-neutral subscriptions, entitlements and period usage", () => {
    assert.match(migration, /provider_subscription_id/);
    assert.match(migration, /create table if not exists billing_entitlements/);
    assert.match(migration, /create table if not exists billing_usage_counters/);
    for (const metric of ["projects", "words", "research_runs", "exports", "mcp_access", "byok_access"]) assert.match(migration, new RegExp(metric));
  });
});
