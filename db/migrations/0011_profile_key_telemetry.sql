alter table generation_telemetry
  add column if not exists profile_key text;

update generation_telemetry
set profile_key = industry || '_' || audience
where profile_key is null
  and industry is not null
  and audience is not null;

create index if not exists generation_telemetry_profile_key_idx
  on generation_telemetry (organisation_id, profile_key, updated_at desc);
