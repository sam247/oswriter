alter table generation_telemetry
  add column if not exists profile_version integer not null default 0,
  add column if not exists region text,
  add column if not exists industry text,
  add column if not exists audience text,
  add column if not exists profile_relevance_score integer,
  add column if not exists region_awareness_active boolean not null default false,
  add column if not exists industry_awareness_active boolean not null default false,
  add column if not exists audience_awareness_active boolean not null default false;

create index if not exists generation_telemetry_profile_idx
  on generation_telemetry (organisation_id, profile_version, region, industry, audience, updated_at desc);

update projects
set document = jsonb_set(
  projects.document,
  '{profile}',
  jsonb_build_object(
    'profileVersion', 1,
    'regionKey', coalesce(projects.document #>> '{profile,regionKey}', 'global'),
    'regionLabel', coalesce(projects.document #>> '{profile,regionLabel}', 'Global'),
    'industryKey', coalesce(projects.document #>> '{profile,industryKey}', 'general'),
    'industryLabel', coalesce(projects.document #>> '{profile,industryLabel}', 'General'),
    'audienceKey', coalesce(projects.document #>> '{profile,audienceKey}', 'general_audience'),
    'audienceLabel', coalesce(projects.document #>> '{profile,audienceLabel}', 'General Audience'),
    'defaultTargetWords', coalesce(
      nullif(project_settings.document #>> '{controls,lengthTargetWords}', '')::integer,
      nullif(projects.document #>> '{profile,defaultTargetWords}', '')::integer,
      1400
    )
  ),
  true
)
from project_settings
where projects.id = project_settings.project_id
  and not (projects.document ? 'profile');

update projects
set document = jsonb_set(
  projects.document,
  '{profile}',
  jsonb_build_object(
    'profileVersion', 1,
    'regionKey', 'global',
    'regionLabel', 'Global',
    'industryKey', 'general',
    'industryLabel', 'General',
    'audienceKey', 'general_audience',
    'audienceLabel', 'General Audience',
    'defaultTargetWords', 1400
  ),
  true
)
where not (document ? 'profile');
