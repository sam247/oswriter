alter table projects
  add column if not exists default_content_profile text
  generated always as (document ->> 'defaultContentProfile') stored;

alter table jobs
  add column if not exists content_profile text
  generated always as (document ->> 'contentProfile') stored;

alter table articles
  add column if not exists content_profile text
  generated always as (document ->> 'contentProfile') stored,
  add column if not exists resolved_content_profile text
  generated always as (document ->> 'resolvedContentProfile') stored;

create index if not exists projects_default_content_profile_idx
  on projects (organisation_id, default_content_profile);

create index if not exists jobs_content_profile_idx
  on jobs (project_id, content_profile);

create index if not exists articles_resolved_content_profile_idx
  on articles (project_id, resolved_content_profile);
