# Roadmap

## Completed

### Harper Grammar And Writing Assistant Integration (Phase 1)

- Added a client-side Harper integration using `harper.js` with a worker-backed linter to keep editor analysis off the main thread.
- Added a resilient Harper linter bootstrap path that falls back to `LocalLinter` if the worker setup fails or hangs in the browser.
- Added a new Writing inspector tab with grouped Grammar, Style, and Readability suggestion counts.
- Added Accept and Ignore actions for Harper suggestions:
  - Accept updates the current article draft immediately
  - Ignore hides the suggestion for the current session
- Added inline writing highlights:
  - custom highlight styling in the rich editor
  - mirrored overlay highlighting for markdown and split editor modes
- Kept Harper scoped to the existing editor workflow only:
  - no research pipeline changes
  - no provider logic changes
  - no telemetry, publishing, billing, auth, or generation workflow changes
- Added markdown normalization coverage for Harper span mapping.

### WordPress Publishing Integration (Phase 1)

- Added project-level WordPress connections with a dedicated Publishing section in Project Settings.
- Added connection testing against `/wp-json/wp/v2/users/me`.
- Added encrypted storage for WordPress application passwords.
- Added Neon schema self-bootstrap for WordPress connection storage so deployed environments can create the connector table on first use.
- Moved WordPress connector setup reads inside route error handling so failed setup returns a surfaced error instead of a generic connector failure.
- Added article-level publishing actions for `Publish Draft` and `Publish Now`.
- Added persisted WordPress publish metadata on articles:
  - Published status
  - WordPress URL
  - Published date
  - WordPress post ID
- Kept publishing scoped to:
  - project settings
  - article publishing actions
  - publish metadata

### Site Knowledge Foundation (V1)

- Added a new Site Knowledge subsection inside Project Settings > Knowledge Base.
- Kept the existing manual Knowledge Base fields unchanged:
  - Brand Name
  - Website
  - About The Business
  - Services
- Added sitemap import for any site with a sitemap, including WordPress, Shopify, Next.js, Webflow, and generic websites.
- Added a zero-cost import pipeline that:
  - fetches the sitemap directly
  - supports sitemap indexes and standard URL sets
  - crawls up to 500 URLs
  - extracts page URL, title, H1, meta description, and a lightweight short summary
- Added project-scoped Site Knowledge storage with:
  - import status
  - sitemap URL
  - last imported timestamp
  - indexed page count
  - per-page records stored separately from the project document
- Added re-import support with URL-level upserts and stale page cleanup so records do not duplicate across imports.
- Added a simple View Pages modal with client-side search and columns for URL, Title, and Last Imported.
- Added dedicated API routes for:
  - site knowledge status
  - streamed imports with progress updates
  - page listing
- Added Neon schema support and tests for the Site Knowledge foundation without introducing embeddings, clustering, internal linking, or recommendation logic.

### WordPress Publishing Workflow (Phase 2)

- Added first-class publishing workflow fields on articles for:
  - `publishing_status`
  - `published_at`
  - `wordpress_post_id`
  - `wordpress_url`
  - `scheduled_publish_at`
- Added relational Neon schema support plus migration coverage while preserving legacy `article.publishing.wordpress` metadata for existing articles.
- Added a shared publishing workflow layer so single-article publish actions, queue automation, and bulk actions reuse the existing WordPress publishing service instead of duplicating publish logic.
- Added queue payload support for post-generation actions:
  - Generate Only
  - Generate + Mark Ready
  - Generate + Publish Draft
  - Generate + Publish Live
- Added post-generation workflow handling in the queue runner so completed articles can stay Draft, become Ready, or publish through the existing WordPress integration automatically.
- Added Content Inventory bulk publishing controls in the existing dashboard:
  - checkbox selection
  - select all
  - bulk action picker
  - selected count
  - progress feedback
  - publishing status badges
- Added a client-safe publishing status helper module so dashboard and summary UI can consume publishing workflow metadata without importing server-only WordPress publishing code into the browser bundle.
- Updated article summary expectations to cover the new publishing workflow fields without exposing full article content in project state.

## Deferred

### WordPress Publishing (Next)

- Schedule post
- Categories
- Tags
- Featured image

### WordPress Publishing (Phase 3)

- Internal link suggestions
- Existing content import
- Site inventory

### Site Knowledge (Future Layers)

- Internal link suggestions
- Related content
- Content gap analysis
- Topic clustering
- SEO recommendations
- Embeddings and semantic search
- Vector storage

## Guardrails

- Do not expand this feature into a full CMS integration.
- Keep research, provider logic, telemetry, benchmarking, billing, auth, and article generation flow unchanged.
- Keep Site Knowledge as a foundation layer only until follow-on recommendation features are explicitly scoped.
