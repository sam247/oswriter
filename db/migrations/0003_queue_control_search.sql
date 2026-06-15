alter table jobs add column if not exists queue_position numeric;

update jobs
set queue_position = extract(epoch from created_at) * 1000
where queue_position is null;

alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check
  check (status in ('queued', 'processing', 'generated', 'needs_review', 'failed', 'skipped'));

alter table articles drop constraint if exists articles_status_check;
alter table articles add constraint articles_status_check
  check (status in ('queued', 'processing', 'generated', 'needs_review', 'failed', 'skipped'));

create table if not exists queue_controls (
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  queue_name text not null default 'default',
  mode text not null default 'running' check (mode in ('running', 'paused', 'stop_after_current', 'stopped')),
  requested_by text,
  requested_at timestamptz,
  stopped_at timestamptz,
  reason text,
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organisation_id, project_id, queue_name)
);

create index if not exists jobs_project_queue_position_idx
  on jobs (organisation_id, project_id, queue_position asc, created_at asc);

create index if not exists jobs_project_status_queue_idx
  on jobs (organisation_id, project_id, status, queue_position asc);

create index if not exists articles_search_tsv_idx
  on articles using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(markdown, '')));

create index if not exists research_findings_search_tsv_idx
  on research_findings using gin (to_tsvector('simple', content));

create index if not exists research_sources_project_last_seen_idx
  on research_sources (organisation_id, project_id, last_seen_at desc);
