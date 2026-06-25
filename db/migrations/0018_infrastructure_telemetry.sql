create table if not exists operational_telemetry (
  id text primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  article_id text null,
  job_id text null,
  batch_run_id text null,
  operation_type text not null,
  status text not null,
  title text null,
  content_profile text null,
  provider text null,
  attribution_date date not null,
  attribution_eligible boolean not null default false,
  attribution_units numeric(12,4) not null default 0,
  started_at timestamptz null,
  completed_at timestamptz null,
  occurred_at timestamptz not null,
  metrics jsonb not null default '{}'::jsonb,
  costs jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  document jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_operational_telemetry_org_project_date
  on operational_telemetry (organisation_id, project_id, attribution_date desc, occurred_at desc);

create index if not exists idx_operational_telemetry_batch
  on operational_telemetry (batch_run_id);

create table if not exists neon_usage_snapshots (
  id text primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  neon_org_id text not null,
  neon_project_id text not null,
  neon_project_name text null,
  granularity text not null,
  timeframe_start timestamptz not null,
  timeframe_end timestamptz not null,
  period_plan text null,
  source text not null,
  captured_at timestamptz not null,
  compute_unit_seconds numeric(20,6) not null default 0,
  compute_cu_hours numeric(20,6) not null default 0,
  root_branch_byte_hours numeric(28,6) not null default 0,
  root_storage_gb_months numeric(20,6) not null default 0,
  child_branch_byte_hours numeric(28,6) not null default 0,
  child_storage_gb_months numeric(20,6) not null default 0,
  instant_restore_byte_hours numeric(28,6) not null default 0,
  instant_restore_gb_months numeric(20,6) not null default 0,
  public_network_transfer_bytes numeric(28,6) not null default 0,
  public_transfer_gb numeric(20,6) not null default 0,
  private_network_transfer_bytes numeric(28,6) not null default 0,
  private_transfer_gb numeric(20,6) not null default 0,
  extra_branches_hours numeric(20,6) not null default 0,
  extra_branches_months numeric(20,6) not null default 0,
  estimated_compute_cost_usd numeric(20,6) not null default 0,
  estimated_storage_cost_usd numeric(20,6) not null default 0,
  estimated_instant_restore_cost_usd numeric(20,6) not null default 0,
  estimated_public_transfer_cost_usd numeric(20,6) not null default 0,
  estimated_private_transfer_cost_usd numeric(20,6) not null default 0,
  estimated_extra_branches_cost_usd numeric(20,6) not null default 0,
  estimated_total_cost_usd numeric(20,6) not null default 0,
  pricing_source text not null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  document jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_neon_usage_snapshots_org_project_day
  on neon_usage_snapshots (organisation_id, neon_project_id, timeframe_start);
