alter table billing_subscriptions
  add column if not exists provider text not null default 'internal',
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text;

create unique index if not exists billing_subscriptions_provider_ref_idx
  on billing_subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create table if not exists billing_entitlements (
  organisation_id text not null references organisations(id) on delete cascade,
  metric text not null check (metric in ('projects', 'words', 'research_runs', 'exports', 'mcp_access', 'byok_access')),
  allowed numeric not null check (allowed >= 0),
  source text not null default 'plan',
  updated_at timestamptz not null default now(),
  primary key (organisation_id, metric)
);

create table if not exists billing_usage_counters (
  organisation_id text not null references organisations(id) on delete cascade,
  metric text not null check (metric in ('projects', 'words', 'research_runs', 'exports', 'mcp_access', 'byok_access')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  used numeric not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (organisation_id, metric, period_start)
);

insert into billing_plans (id, name, metadata)
values
  ('free', 'Free', '{"catalogKey":"free"}'::jsonb),
  ('pro', 'Pro', '{"catalogKey":"pro"}'::jsonb),
  ('byok', 'BYOK', '{"catalogKey":"byok"}'::jsonb)
on conflict (id) do update set name = excluded.name, metadata = excluded.metadata;
