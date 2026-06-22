update articles
set publishing_status = 'not_published'
where publishing_status in ('ready', 'failed');

update articles
set publishing_status = 'not_published'
where publishing_status = 'draft'
  and wordpress_post_id is null
  and coalesce(document #>> '{publishing,wordpress,status}', '') <> 'draft';

comment on column articles.publishing_status is
  'Publishing destination state for the article: not_published, draft, scheduled, or published.';
