alter table articles
  add column if not exists publishing_status text,
  add column if not exists published_at timestamptz,
  add column if not exists wordpress_post_id integer,
  add column if not exists wordpress_url text,
  add column if not exists scheduled_publish_at timestamptz;

comment on column articles.publishing_status is
  'Publishing workflow state for the article: draft, ready, scheduled, published, or failed.';
