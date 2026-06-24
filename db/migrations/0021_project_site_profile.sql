create table if not exists project_site_profile (
  project_id text primary key references projects(id) on delete cascade,
  organisation_id text not null references organisations(id) on delete cascade,
  domain text not null default '',
  page_count integer not null default 0,
  services jsonb not null default '[]'::jsonb,
  products jsonb not null default '[]'::jsonb,
  audiences jsonb not null default '[]'::jsonb,
  locations jsonb not null default '[]'::jsonb,
  ctas jsonb not null default '[]'::jsonb,
  writing_signals jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  document jsonb not null,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_site_profile_org
  on project_site_profile (organisation_id, updated_at desc);

comment on table project_site_profile is
  'Derived project website intelligence generated from imported sitemap pages. Used as the primary project intelligence layer for generation, SEO, linking, and CTA systems.';
