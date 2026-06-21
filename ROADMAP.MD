# Roadmap

## Completed

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
