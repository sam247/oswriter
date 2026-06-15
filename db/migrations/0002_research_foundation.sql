create table if not exists research_runs (
  id text primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  research_pack_id text references research_packs(id) on delete set null,
  article_id text,
  job_id text references jobs(id) on delete set null,
  run_number integer not null default 1,
  title text not null,
  query text,
  queries jsonb not null default '[]'::jsonb,
  status text not null default 'completed' check (status in ('queued', 'running', 'completed', 'failed')),
  confidence numeric,
  authority_score numeric,
  relevance_score numeric,
  warnings jsonb not null default '[]'::jsonb,
  request_ids jsonb not null default '[]'::jsonb,
  duration_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, project_id, article_id, run_number)
);

alter table research_sources add column if not exists source_key text;
alter table research_sources add column if not exists first_seen_at timestamptz not null default now();
alter table research_sources add column if not exists last_seen_at timestamptz not null default now();
alter table research_sources add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table research_sources alter column research_pack_id drop not null;
alter table research_sources alter column article_id drop not null;

update research_sources
set source_key = md5(lower(trim(url)))
where source_key is null;

delete from research_sources newer
using research_sources older
where newer.ctid > older.ctid
  and newer.organisation_id = older.organisation_id
  and newer.project_id = older.project_id
  and newer.url = older.url;

create unique index if not exists research_sources_project_source_key_idx
  on research_sources (organisation_id, project_id, source_key)
  where source_key is not null;

create unique index if not exists research_sources_project_url_idx
  on research_sources (organisation_id, project_id, url);

create table if not exists research_findings (
  id text primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  research_run_id text not null references research_runs(id) on delete cascade,
  source_id text references research_sources(id) on delete set null,
  finding_type text not null check (finding_type in ('useful_fact', 'rejected_fact', 'question', 'heading', 'summary')),
  content text not null,
  confidence numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists source_citations (
  id text primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  research_run_id text references research_runs(id) on delete cascade,
  source_id text not null references research_sources(id) on delete cascade,
  finding_id text references research_findings(id) on delete set null,
  article_id text,
  citation_type text not null default 'research_source',
  snippet text,
  url text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists research_runs_project_idx
  on research_runs (organisation_id, project_id, created_at desc);

create index if not exists research_runs_article_idx
  on research_runs (organisation_id, project_id, article_id, run_number desc);

create index if not exists research_sources_project_domain_idx
  on research_sources (organisation_id, project_id, domain);

create index if not exists research_findings_run_idx
  on research_findings (research_run_id, finding_type);

create index if not exists research_findings_project_idx
  on research_findings (organisation_id, project_id, finding_type, created_at desc);

create index if not exists source_citations_source_idx
  on source_citations (organisation_id, project_id, source_id, created_at desc);

create index if not exists source_citations_run_idx
  on source_citations (research_run_id, source_id);
