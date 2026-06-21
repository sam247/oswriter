alter table generation_telemetry
  add column if not exists profile_key text,
  add column if not exists content_profile text,
  add column if not exists benchmark_run text,
  add column if not exists benchmark_pair_id text,
  add column if not exists research_provider_name text,
  add column if not exists research_provider_type text,
  add column if not exists provider_credits numeric,
  add column if not exists provider_cost_pricing_source text,
  add column if not exists generation_cost_pricing_source text;

update generation_telemetry as telemetry
set
  profile_key = coalesce(telemetry.profile_key, telemetry.metadata ->> 'profileKey'),
  content_profile = coalesce(telemetry.content_profile, telemetry.metadata ->> 'contentProfile'),
  research_provider_name = coalesce(telemetry.research_provider_name, telemetry.metadata ->> 'researchProviderName'),
  research_provider_type = coalesce(telemetry.research_provider_type, telemetry.metadata ->> 'researchProviderType'),
  provider_credits = coalesce(telemetry.provider_credits, nullif(telemetry.metadata ->> 'providerCreditsUsed', '')::numeric),
  provider_cost_pricing_source = coalesce(telemetry.provider_cost_pricing_source, telemetry.metadata ->> 'providerCostPricingSource'),
  benchmark_run = coalesce(telemetry.benchmark_run, 'Provider Benchmark ' || to_char(telemetry.updated_at, 'YYYY-MM'))
where telemetry.profile_key is null
   or telemetry.content_profile is null
   or telemetry.research_provider_name is null
   or telemetry.research_provider_type is null
   or telemetry.provider_credits is null
   or telemetry.provider_cost_pricing_source is null
   or telemetry.benchmark_run is null;

create index if not exists generation_telemetry_benchmark_idx
  on generation_telemetry (organisation_id, benchmark_run, research_provider_type, updated_at desc);

create index if not exists generation_telemetry_provider_idx
  on generation_telemetry (organisation_id, actual_research_provider, research_provider_name, updated_at desc);
