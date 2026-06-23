# Roadmap

## Completed

### QueueWrite Global Navigation Separation (V1)

- Replaced the `OS Writer V2` top-bar brand with a `QueueWrite` global navigation trigger.
- Reduced the QueueWrite logo menu to a minimal application menu with only:
  - Account Settings
  - Billing
  - Help
  - Changelog
- Removed menu headers, helper copy, secondary right-side labels, and all non-requested actions from the global menu.
- Kept `Help` and `Changelog` visible as greyed-out items.
- Simplified the project dropdown so it now focuses on project switching only:
  - project list
  - current project indicator
  - create project
- Removed the old right-side `Open` labels from project rows and restored compact per-project settings and delete icon controls.
- Added a dedicated `Project Settings` button to the project dashboard header so project-scoped management remains accessible outside the switcher.
- Preserved clickable breadcrumbs for fast movement between the project dashboard and the currently selected article.
- Adjusted the first pass after UI review so the header project name is breadcrumb-only again, while the pure project switcher lives in the left sidebar where users expect it.
- Raised the sidebar project switcher layering so the menu opens above dashboard content instead of behind center-pane elements.
- Flattened the sidebar project switcher presentation by removing the nested inner list container around project rows.
- Added a light divider between the project list and `Create Project` to keep the footer action visually separate.
- Raised the header layer so the QueueWrite logo menu can open reliably above the workspace surfaces again.
- Updated the app metadata title to `QueueWrite` to match the new global navigation label.

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
- Restored the Harper deploy path by wiring the Writing panel to the expanded suggestion props and re-adding the missing Neon Harper telemetry schema bootstrap and aggregate helpers required by the analytics route.

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
- Removed the queue-side article type selector so new titles always inherit the project-level content profile from Project Settings.
- Refined the Content Inventory bulk action bar with cleaner spacing, clearer hierarchy, and lighter row treatment to reduce dashboard form clutter.
- Tightened the bulk publishing header spacing again so the title, selection state, controls, and helper text sit as a compact tool row instead of a tall stacked panel.
- Fixed the Content Inventory table grid sizing so the header and article rows render directly under the bulk publishing controls without a false empty gap in the centre panel.
- Aligned the project inventory header with the selectable article row columns by matching the header structure to the checkbox-plus-content table layout.
- Rebuilt the centre-panel inventory list as a fixed-column table so headers and row values align tightly with a more clinical spreadsheet-style presentation.
- Removed sort arrows from the centre-panel inventory headers and switched the active sort column to a bold label so sorting does not disturb column alignment.
- Rebalanced the lower inventory fixed column widths so the `Updated` header fits cleanly alongside the selectable and publish columns.
- Removed the `Words` column from `Needs Attention` and made `Content Inventory` use the same reduced column layout, with the bottom table differing only by its selection checkbox for bulk actions.
- Simplified publishing workflow states by removing `Ready` and normalizing article publishing to `Not Published`, `Draft`, `Scheduled`, or `Published`.
- Simplified bulk publishing actions to `Publish Draft`, `Publish Now`, and `Schedule`, with scheduling handled in a dedicated modal instead of inline table controls.
- Added reusable scheduling helpers and a schedule bulk endpoint so future queue automation can share the same scheduling architecture without redesigning the table.
- Moved single-article publish controls into the editor toolbar beside `Rich`, `MD`, and `Split` as a compact `Publish` dropdown, and greyed it out after live publish to prevent repeat publishing.
- Repositioned the single-article `Publish` dropdown into the export cluster so it sits beside `Export` as part of the publishing/export area.
- Made the Project Settings accordion stack respond to the available centre-pane width and use one even small gap between `Project Settings`, `Knowledge Base`, and `Publishing`.
- Removed the centred document-style width cap from Project Settings so the accordion stack now uses the actual centre-pane workspace width.
- Removed the legacy queue-side `After generation` selector because post-generation behavior is now controlled from the main `Generate` button.
- Removed the remaining generic settings width cap so settings cards can use the centre pane width instead of a narrower fixed content column.
- Turned the top project/article breadcrumb labels into clickable navigation controls so users can jump back to project overview or reopen the current article context directly from the header.
- Increased the header search trigger width so the global search control reads more clearly in the top toolbar.
- Added a visible divider between the centre workspace and right inspector so the pane boundary stays readable against the light UI surfaces.
- Made the Project Settings page sections collapsible with the requested defaults:
  - Project Settings expanded
  - Knowledge Base collapsed
  - Publishing collapsed
- Added a client-safe publishing status helper module so dashboard and summary UI can consume publishing workflow metadata without importing server-only WordPress publishing code into the browser bundle.
- Updated article summary expectations to cover the new publishing workflow fields without exposing full article content in project state.

## Deferred

### WordPress Publishing (Next)

- Execute scheduled publishing automatically when scheduled articles become due
- Reintroduce a tighter publishing-status column in `Content Inventory` on top of the simplified shared table layout
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
