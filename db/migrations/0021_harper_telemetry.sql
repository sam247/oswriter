create table if not exists harper_telemetry (
  id text primary key default gen_random_uuid()::text,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  article_id text not null references articles(id) on delete cascade,
  content_profile text,
  rule_id text not null,
  suggestion_id text not null,
  category text not null,
  action text not null check (action in ('shown', 'accepted', 'ignored')),
  timestamp timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_harper_telemetry_project_timestamp
  on harper_telemetry (organisation_id, project_id, timestamp desc);

create index if not exists idx_harper_telemetry_rule
  on harper_telemetry (organisation_id, project_id, rule_id);

create index if not exists idx_harper_telemetry_profile
  on harper_telemetry (organisation_id, project_id, content_profile);
