create table if not exists project_site_knowledge (
  project_id text primary key references projects(id) on delete cascade,
  organisation_id text not null references organisations(id) on delete cascade,
  sitemap_url text not null,
  status text not null default 'not_configured',
  pages_indexed integer not null default 0,
  processed_pages integer not null default 0,
  total_discovered_urls integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  last_imported_at timestamptz,
  current_url text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_site_knowledge_org
  on project_site_knowledge (organisation_id, updated_at desc);

create table if not exists project_site_pages (
  id text primary key,
  organisation_id text not null references organisations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  url text not null,
  title text not null default '',
  h1 text,
  meta_description text,
  short_summary text,
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  document jsonb not null,
  updated_at timestamptz not null default now(),
  unique (organisation_id, project_id, url)
);

create index if not exists idx_project_site_pages_project_imported
  on project_site_pages (organisation_id, project_id, imported_at desc);

create index if not exists idx_project_site_pages_project_title
  on project_site_pages (organisation_id, project_id, title);

comment on table project_site_knowledge is
  'Project-scoped site knowledge import status and sitemap configuration for future semantic and recommendation features.';

comment on table project_site_pages is
  'Normalized website page inventory imported from a sitemap. Kept lightweight in V1 and designed for future embeddings or semantic layers.';
