create table if not exists project_wordpress_connections (
  project_id text primary key references projects(id) on delete cascade,
  organisation_id text not null references organisations(id) on delete cascade,
  created_by_user_id text not null references users(id),
  site_url text not null,
  username text not null,
  encrypted_application_password text not null,
  connection_status text not null default 'not_connected',
  default_post_status text not null default 'draft',
  default_category text,
  last_validated_at timestamptz,
  last_error text,
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_wordpress_connections_org
  on project_wordpress_connections (organisation_id, updated_at desc);

comment on table project_wordpress_connections is
  'Project-scoped WordPress publishing connections. Application passwords are encrypted before persistence and are never returned through normal project state.';
