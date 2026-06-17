alter table generation_telemetry
  add column if not exists created_by_user_id text,
  add column if not exists target_words integer not null default 0,
  add column if not exists actual_words integer not null default 0,
  add column if not exists planned_sections integer not null default 0,
  add column if not exists actual_sections integer not null default 0,
  add column if not exists finish_reason text,
  add column if not exists review_status text not null default 'generated',
  add column if not exists research_duration_ms integer,
  add column if not exists sources_discovered integer not null default 0,
  add column if not exists sources_accepted integer not null default 0,
  add column if not exists sources_rejected integer not null default 0,
  add column if not exists findings_extracted integer not null default 0,
  add column if not exists useful_facts_extracted integer not null default 0,
  add column if not exists citations_generated integer not null default 0,
  add column if not exists research_tokens integer not null default 0,
  add column if not exists generation_tokens integer not null default 0;

alter table generation_telemetry
  drop constraint if exists generation_telemetry_review_status_check;

alter table generation_telemetry
  add constraint generation_telemetry_review_status_check
  check (review_status in ('generated', 'needs_review', 'failed', 'queued', 'processing', 'skipped'));

create index if not exists generation_telemetry_month_idx
  on generation_telemetry (organisation_id, updated_at desc);

create index if not exists generation_telemetry_project_cost_idx
  on generation_telemetry (organisation_id, project_id, total_cost_usd desc);

create index if not exists generation_telemetry_user_idx
  on generation_telemetry (organisation_id, created_by_user_id, updated_at desc);

create table if not exists telemetry_export_status (
  id text primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  export_type text not null,
  project_id text references projects(id) on delete cascade,
  article_id text,
  export_key text not null,
  target_sheet text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, export_type, export_key, target_sheet),
  constraint telemetry_export_status_type_check
    check (export_type in ('article', 'daily_summary', 'anomaly')),
  constraint telemetry_export_status_status_check
    check (status in ('pending', 'exported', 'failed'))
);

create index if not exists telemetry_export_status_pending_idx
  on telemetry_export_status (organisation_id, status, export_type, updated_at desc);

create index if not exists telemetry_export_status_article_idx
  on telemetry_export_status (organisation_id, project_id, article_id);
