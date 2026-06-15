create extension if not exists pgcrypto;

create table if not exists organisations (
  id text primary key,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organisation_settings (
  organisation_id text primary key references organisations(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  auth_subject text not null unique,
  email text not null,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organisation_users (
  organisation_id text not null references organisations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);

create table if not exists projects (
  id text primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  name text not null,
  slug text not null,
  created_by_user_id text not null references users(id),
  document jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organisation_id, slug)
);

create table if not exists project_settings (
  project_id text primary key references projects(id) on delete cascade,
  organisation_id text not null references organisations(id) on delete cascade,
  settings jsonb not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_key_providers (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists api_keys (
  id text primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  provider_id text not null references api_key_providers(id),
  label text not null,
  encrypted_secret_ref text not null,
  status text not null default 'active',
  created_by_user_id text not null references users(id),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_api_key_bindings (
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  provider_id text not null references api_key_providers(id),
  api_key_id text not null references api_keys(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organisation_id, project_id, provider_id)
);

create table if not exists billing_accounts (
  organisation_id text primary key references organisations(id) on delete cascade,
  billing_customer_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists billing_plans (
  id text primary key,
  name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists billing_subscriptions (
  id text primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  plan_id text references billing_plans(id),
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jobs (
  id text primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  article_id text not null,
  title text not null,
  status text not null check (status in ('queued', 'processing', 'generated', 'needs_review', 'failed')),
  status_reason text,
  attempts integer not null default 0,
  needs_review_reasons jsonb not null default '[]'::jsonb,
  fatal_error text,
  pipeline jsonb not null,
  timings jsonb not null default '{}'::jsonb,
  created_by_user_id text not null references users(id),
  document jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists articles (
  id text primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  job_id text not null references jobs(id) on delete restrict,
  title text not null,
  status text not null check (status in ('queued', 'processing', 'generated', 'needs_review', 'failed')),
  status_reason text,
  markdown text not null,
  markdown_blob_path text,
  current_version_number integer not null default 1,
  versioned_at timestamptz,
  word_count integer not null,
  quality_score numeric not null,
  research_summary text not null,
  validation jsonb not null,
  pipeline jsonb not null,
  sources jsonb not null default '[]'::jsonb,
  needs_review_reasons jsonb not null default '[]'::jsonb,
  timings jsonb not null default '{}'::jsonb,
  created_by_user_id text not null references users(id),
  document jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists document_versions (
  id text primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  document_id text not null,
  document_type text not null,
  version_number integer not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id text not null references users(id),
  created_at timestamptz not null default now(),
  unique (organisation_id, project_id, document_type, document_id, version_number)
);

create table if not exists research_packs (
  id text primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  article_id text not null,
  job_id text references jobs(id) on delete set null,
  run_number integer not null default 1,
  title text not null,
  queries jsonb not null,
  useful_facts jsonb not null,
  rejected_facts jsonb not null,
  questions_found jsonb not null,
  headings_found jsonb not null,
  authority_score numeric not null,
  relevance_score numeric not null,
  confidence numeric not null,
  warnings jsonb not null,
  request_ids jsonb not null,
  duration_ms integer not null,
  raw_blob_path text,
  document jsonb not null,
  created_at timestamptz not null
);

create table if not exists research_sources (
  id text primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  research_pack_id text not null references research_packs(id) on delete cascade,
  article_id text not null,
  title text not null,
  url text not null,
  domain text not null,
  summary text,
  highlights jsonb not null default '[]'::jsonb,
  authority_score numeric not null,
  relevance_score numeric not null,
  accepted boolean not null,
  rejection_reason text
);

create table if not exists worker_leases (
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  queue_name text not null default 'default',
  lease_id text not null,
  owner text not null,
  token text not null,
  acquired_at timestamptz not null,
  expires_at timestamptz not null,
  document jsonb not null,
  primary key (organisation_id, project_id, queue_name)
);

create table if not exists timing_events (
  id bigserial primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text references projects(id) on delete cascade,
  job_id text references jobs(id) on delete cascade,
  article_id text references articles(id) on delete cascade,
  event_name text not null,
  event_context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null
);

create table if not exists debug_events (
  id bigserial primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  job_id text not null,
  article_id text not null,
  stage text not null,
  level text not null,
  message text not null,
  data jsonb,
  occurred_at timestamptz not null
);

create table if not exists provider_requests (
  id text primary key default gen_random_uuid()::text,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text references projects(id) on delete cascade,
  provider text not null,
  model text,
  request_type text not null,
  request_id text,
  job_id text references jobs(id) on delete set null,
  article_id text references articles(id) on delete set null,
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_ms integer,
  success boolean not null default false,
  estimated_cost numeric,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists exports (
  id text primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  article_id text references articles(id) on delete set null,
  format text not null,
  blob_path text not null,
  created_by_user_id text not null references users(id),
  article_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists usage_events (
  id text primary key default gen_random_uuid()::text,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text references projects(id) on delete cascade,
  event_type text not null check (event_type in ('article_generated', 'research_run', 'export_created', 'provider_call')),
  provider text,
  model text,
  units numeric,
  estimated_cost numeric,
  job_id text references jobs(id) on delete set null,
  article_id text references articles(id) on delete set null,
  export_id text references exports(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table if not exists usage_rollups (
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text references projects(id) on delete cascade,
  period_start date not null,
  period_grain text not null check (period_grain in ('day', 'month')),
  event_type text not null,
  units numeric not null default 0,
  estimated_cost numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organisation_id, project_id, period_start, period_grain, event_type)
);

create index if not exists jobs_queue_idx on jobs (organisation_id, project_id, status, created_at);
create index if not exists jobs_updated_idx on jobs (organisation_id, project_id, updated_at);
create index if not exists articles_project_updated_idx on articles (organisation_id, project_id, updated_at desc);
create index if not exists research_sources_pack_idx on research_sources (research_pack_id);
create index if not exists worker_leases_expiry_idx on worker_leases (organisation_id, project_id, expires_at);
create index if not exists timing_events_job_idx on timing_events (job_id, event_name, occurred_at);
create index if not exists debug_events_article_idx on debug_events (article_id, occurred_at);
create index if not exists document_versions_history_idx on document_versions (organisation_id, project_id, document_type, document_id, version_number desc);
create index if not exists provider_requests_lookup_idx on provider_requests (organisation_id, project_id, provider, request_type, started_at desc);
create index if not exists usage_events_lookup_idx on usage_events (organisation_id, project_id, event_type, occurred_at desc);
