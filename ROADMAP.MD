# Roadmap

## Completed

### Harper Grammar And Writing Assistant Integration (Phase 1)

- Added a client-side Harper integration using `harper.js` with a worker-backed linter to keep editor analysis off the main thread.
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

## Deferred

### WordPress Publishing (Phase 2)

- Schedule post
- Categories
- Tags
- Featured image

### WordPress Publishing (Phase 3)

- Internal link suggestions
- Existing content import
- Site inventory

## Guardrails

- Do not expand this feature into a full CMS integration.
- Keep research, provider logic, telemetry, benchmarking, billing, auth, and article generation flow unchanged.
