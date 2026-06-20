alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check
  check (status in ('queued', 'processing', 'generated', 'needs_review', 'research_failed', 'failed', 'skipped'));

alter table jobs
  add column if not exists requested_research_provider text
    generated always as (document #>> '{researchTelemetry,requestedResearchProvider}') stored,
  add column if not exists actual_research_provider text
    generated always as (document #>> '{researchTelemetry,actualResearchProvider}') stored,
  add column if not exists research_fallback_used boolean
    generated always as (coalesce((document #>> '{researchTelemetry,fallbackUsed}')::boolean, false)) stored,
  add column if not exists research_fallback_reason text
    generated always as (document #>> '{researchTelemetry,fallbackReason}') stored;

alter table research_packs
  add column if not exists requested_research_provider text
    generated always as (coalesce(document ->> 'requestedResearchProvider', document ->> 'researchProvider', 'queuewrite')) stored,
  add column if not exists actual_research_provider text
    generated always as (coalesce(document ->> 'actualResearchProvider', document ->> 'researchProvider', 'queuewrite')) stored,
  add column if not exists fallback_used boolean
    generated always as (coalesce((document ->> 'fallbackUsed')::boolean, false)) stored,
  add column if not exists fallback_reason text
    generated always as (document ->> 'fallbackReason') stored;

alter table generation_telemetry
  add column if not exists requested_research_provider text,
  add column if not exists actual_research_provider text,
  add column if not exists fallback_used boolean not null default false,
  add column if not exists fallback_reason text;

create index if not exists jobs_research_provider_outcome_idx
  on jobs (organisation_id, requested_research_provider, actual_research_provider, research_fallback_used, updated_at desc);

create index if not exists research_packs_provider_outcome_idx
  on research_packs (organisation_id, requested_research_provider, actual_research_provider, fallback_used, created_at desc);
