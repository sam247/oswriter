alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check
  check (status in ('queued', 'processing', 'generated', 'needs_review', 'approved', 'scheduled', 'published', 'research_failed', 'failed', 'skipped'));

alter table articles drop constraint if exists articles_status_check;
alter table articles add constraint articles_status_check
  check (status in ('queued', 'processing', 'generated', 'needs_review', 'approved', 'scheduled', 'published', 'research_failed', 'failed', 'skipped'));

alter table generation_telemetry drop constraint if exists generation_telemetry_review_status_check;
alter table generation_telemetry add constraint generation_telemetry_review_status_check
  check (review_status in ('generated', 'needs_review', 'approved', 'scheduled', 'published', 'failed', 'queued', 'processing', 'skipped'));

alter table articles
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text;

comment on column articles.approved_at is
  'Timestamp when a reviewer explicitly approved the article.';

comment on column articles.approved_by is
  'Reviewer identifier when available.';
