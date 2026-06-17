alter table generation_telemetry
  add column if not exists planned_h2_count integer not null default 0,
  add column if not exists planned_h3_count integer not null default 0,
  add column if not exists expected_depth text,
  add column if not exists actual_h2_count integer not null default 0,
  add column if not exists actual_h3_count integer not null default 0,
  add column if not exists actual_depth text,
  add column if not exists h2_achievement_percent numeric(6,2),
  add column if not exists h3_achievement_percent numeric(6,2),
  add column if not exists target_achievement_percent numeric(6,2),
  add column if not exists planner_outcome text;

update generation_telemetry
set
  planned_h2_count = case
    when planned_h2_count = 0 then planned_sections
    else planned_h2_count
  end,
  actual_h2_count = case
    when actual_h2_count = 0 then actual_sections
    else actual_h2_count
  end,
  h2_achievement_percent = coalesce(
    h2_achievement_percent,
    case
      when planned_sections > 0 then round((actual_sections::numeric / planned_sections::numeric) * 100, 2)
      else null
    end
  ),
  h3_achievement_percent = coalesce(h3_achievement_percent, 100),
  target_achievement_percent = coalesce(
    target_achievement_percent,
    case
      when target_words > 0 then round((actual_words::numeric / target_words::numeric) * 100, 2)
      else null
    end
  ),
  expected_depth = coalesce(expected_depth, metadata #>> '{planningDiagnostics,expectedDepth}', 'standard'),
  actual_depth = coalesce(actual_depth, metadata #>> '{planningDiagnostics,actualDepth}', 'light'),
  planner_outcome = coalesce(
    planner_outcome,
    metadata #>> '{planningDiagnostics,plannerOutcome}',
    case
      when target_words > 0 and actual_words::numeric < target_words::numeric * 0.8 then 'under_target'
      when target_words > 0 and actual_words::numeric > target_words::numeric * 1.1 then 'over_target'
      else 'matched_plan'
    end
  );

create index if not exists generation_telemetry_planning_idx
  on generation_telemetry (organisation_id, expected_depth, planner_outcome, updated_at desc);
