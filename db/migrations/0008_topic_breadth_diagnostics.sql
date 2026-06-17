alter table generation_telemetry
  add column if not exists research_concept_count integer not null default 0,
  add column if not exists research_concepts jsonb not null default '[]'::jsonb,
  add column if not exists planned_breadth_ratio numeric(6,2),
  add column if not exists actual_breadth_coverage integer not null default 0,
  add column if not exists actual_breadth_coverage_percent numeric(6,2),
  add column if not exists breadth_status text;

update generation_telemetry
set
  research_concepts = coalesce(metadata #> '{planningDiagnostics,researchConcepts}', research_concepts, '[]'::jsonb),
  research_concept_count = coalesce(
    nullif(research_concept_count, 0),
    nullif(metadata #>> '{planningDiagnostics,researchConceptCount}', '')::integer,
    jsonb_array_length(coalesce(metadata #> '{planningDiagnostics,researchConcepts}', research_concepts, '[]'::jsonb)),
    0
  ),
  planned_breadth_ratio = coalesce(
    planned_breadth_ratio,
    nullif(metadata #>> '{planningDiagnostics,plannedBreadthRatio}', '')::numeric
  ),
  actual_breadth_coverage = coalesce(
    nullif(actual_breadth_coverage, 0),
    nullif(metadata #>> '{planningDiagnostics,actualBreadthCoverage}', '')::integer,
    0
  ),
  actual_breadth_coverage_percent = coalesce(
    actual_breadth_coverage_percent,
    nullif(metadata #>> '{planningDiagnostics,actualBreadthCoveragePercent}', '')::numeric
  ),
  breadth_status = coalesce(breadth_status, metadata #>> '{planningDiagnostics,breadthStatus}');

create index if not exists generation_telemetry_breadth_idx
  on generation_telemetry (organisation_id, breadth_status, research_concept_count, updated_at desc);
