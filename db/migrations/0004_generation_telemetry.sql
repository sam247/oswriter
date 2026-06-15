create table if not exists generation_telemetry (
  id text primary key default gen_random_uuid()::text,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  article_id text not null references articles(id) on delete cascade,
  job_id text references jobs(id) on delete set null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_ai_cost_usd numeric not null default 0,
  exa_search_calls integer not null default 0,
  exa_content_calls integer not null default 0,
  estimated_research_cost_usd numeric not null default 0,
  total_cost_usd numeric not null default 0,
  generation_duration_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, project_id, article_id)
);

create index if not exists generation_telemetry_project_updated_idx
  on generation_telemetry (organisation_id, project_id, updated_at desc);

create index if not exists generation_telemetry_article_idx
  on generation_telemetry (organisation_id, project_id, article_id);
