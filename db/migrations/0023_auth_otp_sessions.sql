create table if not exists auth_otp_codes (
  id text primary key,
  email text not null,
  purpose text not null check (purpose in ('login', 'signup')),
  code_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  request_ip_hash text
);

create index if not exists auth_otp_codes_email_purpose_idx
  on auth_otp_codes (lower(email), purpose, created_at desc);

create index if not exists auth_otp_codes_request_ip_idx
  on auth_otp_codes (request_ip_hash, created_at desc);

create table if not exists auth_sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  organisation_id text not null references organisations(id) on delete cascade,
  email text not null,
  name text,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists auth_sessions_active_lookup_idx
  on auth_sessions (token_hash, expires_at)
  where revoked_at is null;
