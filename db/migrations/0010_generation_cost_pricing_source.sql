alter table generation_telemetry
  add column if not exists generation_cost_pricing_source text;
