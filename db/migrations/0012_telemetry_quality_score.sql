alter table generation_telemetry
  add column if not exists quality_score integer not null default 0,
  add column if not exists quality_band text not null default 'Poor';

with components as (
  select
    id,
    case
      when coalesce(target_achievement_percent, 0) between 95 and 115 then 100
      when coalesce(target_achievement_percent, 0) < 95 then greatest(0, least(100, round(coalesce(target_achievement_percent, 0) / 95.0 * 100)))
      else greatest(0, least(100, round(100 - (coalesce(target_achievement_percent, 0) - 115) * 2)))
    end as target_score,
    case
      when planned_h2_count <= 0 then case when actual_h2_count <= 0 then 100 else 90 end
      else greatest(0, least(100, round(actual_h2_count::numeric / planned_h2_count * 100)))
    end as h2_score,
    case
      when planned_h3_count <= 0 then 100
      else greatest(0, least(100, round(actual_h3_count::numeric / planned_h3_count * 100)))
    end as h3_score,
    greatest(0, least(100, round(coalesce(actual_breadth_coverage_percent, 0)))) as breadth_score,
    case
      when breadth_status = 'underplanned' then 60
      when planner_outcome = 'matched_plan' then 100
      when planner_outcome = 'under_depth' then 70
      when planner_outcome = 'over_depth' then 90
      when planner_outcome = 'underplanned' then 60
      else 70
    end as depth_score,
    greatest(0, least(100,
      least(50, greatest(0, coalesce(research_concept_count, 0)) * 2.5)
      + least(50, greatest(0, coalesce(sources_accepted, 0)) * 5)
    )) as research_score
  from generation_telemetry
), scored as (
  select
    id,
    greatest(0, least(100, round(
      target_score * 0.25
      + h2_score * 0.20
      + h3_score * 0.15
      + breadth_score * 0.20
      + depth_score * 0.10
      + research_score * 0.10
    )))::integer as score
  from components
)
update generation_telemetry as telemetry
set
  quality_score = scored.score,
  quality_band = case
    when scored.score >= 90 then 'Excellent'
    when scored.score >= 80 then 'Good'
    when scored.score >= 70 then 'Acceptable'
    when scored.score >= 60 then 'Weak'
    else 'Poor'
  end
from scored
where telemetry.id = scored.id;

create index if not exists generation_telemetry_quality_idx
  on generation_telemetry (organisation_id, quality_score desc, updated_at desc);
