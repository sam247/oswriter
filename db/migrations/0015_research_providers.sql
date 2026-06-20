create table if not exists user_provider_preferences (
  organisation_id text not null references organisations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);

alter table research_packs
  add column if not exists research_provider text
    generated always as (coalesce(document ->> 'researchProvider', 'queuewrite')) stored,
  add column if not exists sources_found integer
    generated always as (coalesce(nullif(document ->> 'sourcesFound', '')::integer, 0)) stored,
  add column if not exists sources_accepted integer
    generated always as (jsonb_array_length(coalesce(document -> 'sources', '[]'::jsonb))) stored,
  add column if not exists evidence_items_extracted integer
    generated always as (coalesce(nullif(document ->> 'evidenceItemsExtracted', '')::integer, 0)) stored,
  add column if not exists evidence_items_used integer
    generated always as (coalesce(nullif(document ->> 'evidenceItemsUsed', '')::integer, 0)) stored,
  add column if not exists research_cost_usd numeric
    generated always as (coalesce(nullif(document ->> 'researchCostUsd', '')::numeric, 0)) stored,
  add column if not exists cost_per_source numeric
    generated always as (coalesce(nullif(document ->> 'costPerSource', '')::numeric, 0)) stored,
  add column if not exists cost_per_accepted_source numeric
    generated always as (coalesce(nullif(document ->> 'costPerAcceptedSource', '')::numeric, 0)) stored,
  add column if not exists cost_per_evidence_item numeric
    generated always as (coalesce(nullif(document ->> 'costPerEvidenceItem', '')::numeric, 0)) stored;

create index if not exists research_packs_provider_created_idx
  on research_packs (organisation_id, research_provider, created_at desc);

comment on table user_provider_preferences is
  'Per-user provider selection and BYOK credentials. Never expose credential values in research telemetry or public provider labels.';
