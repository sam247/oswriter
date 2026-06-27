create table if not exists project_shopify_connections (
  project_id text primary key references projects(id) on delete cascade,
  organisation_id text not null references organisations(id) on delete cascade,
  created_by_user_id text not null references users(id),
  shop_domain text not null,
  encrypted_access_token text not null,
  granted_scopes text not null default '',
  connection_status text not null default 'not_connected',
  installed_at timestamptz,
  last_validated_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_shopify_connections_org
  on project_shopify_connections (organisation_id, updated_at desc);

comment on table project_shopify_connections is
  'Project-scoped Shopify publishing destination connections. Access tokens are AES-256-GCM encrypted before persistence and are never returned through normal project state.';
