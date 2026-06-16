alter table organisation_settings
  add column if not exists workspace_preferences jsonb not null default '{}'::jsonb;

comment on column organisation_settings.workspace_preferences is
  'Workspace/user preferences for account details, notifications, AI provider preference, and operational UI settings. BYOK key material is not stored here.';
