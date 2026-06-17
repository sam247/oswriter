alter table generation_telemetry
  add column if not exists generation_provider text,
  add column if not exists generation_model text,
  add column if not exists total_tokens integer not null default 0,
  add column if not exists estimated_generation_cost_usd numeric not null default 0,
  add column if not exists exa_search_requests integer not null default 0,
  add column if not exists exa_content_pages integer not null default 0,
  add column if not exists estimated_exa_search_cost_usd numeric not null default 0,
  add column if not exists estimated_exa_content_cost_usd numeric not null default 0,
  add column if not exists total_duration_ms integer,
  add column if not exists cost_per_word numeric not null default 0,
  add column if not exists cost_per_research_concept numeric not null default 0,
  add column if not exists cost_per_source numeric not null default 0;

update generation_telemetry
set
  generation_model = coalesce(generation_model, model),
  total_tokens = coalesce(nullif(total_tokens, 0), input_tokens + output_tokens),
  estimated_generation_cost_usd = coalesce(nullif(estimated_generation_cost_usd, 0), estimated_ai_cost_usd),
  exa_search_requests = coalesce(nullif(exa_search_requests, 0), exa_search_calls),
  exa_content_pages = coalesce(nullif(exa_content_pages, 0), exa_content_calls),
  estimated_exa_search_cost_usd = coalesce(
    nullif(estimated_exa_search_cost_usd, 0),
    round((exa_search_calls * 0.007)::numeric, 6)
  ),
  estimated_exa_content_cost_usd = coalesce(
    nullif(estimated_exa_content_cost_usd, 0),
    round((exa_content_calls * 0.001)::numeric, 6)
  ),
  total_duration_ms = coalesce(total_duration_ms, research_duration_ms + generation_duration_ms),
  cost_per_word = case when actual_words > 0 then round((total_cost_usd / actual_words)::numeric, 6) else cost_per_word end,
  cost_per_research_concept = case when research_concept_count > 0 then round((total_cost_usd / research_concept_count)::numeric, 6) else cost_per_research_concept end,
  cost_per_source = case when sources_discovered > 0 then round((total_cost_usd / sources_discovered)::numeric, 6) else cost_per_source end;

create index if not exists generation_telemetry_cost_idx
  on generation_telemetry (organisation_id, total_cost_usd desc, updated_at desc);
